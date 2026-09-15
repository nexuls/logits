"use client";

import { useSyncExternalStore } from "react";

import { RollingWindow } from "@/lib/perf/rolling-window";
import {
  createSimulationCounters,
  type Simulation,
  type SimulationCounters,
  useSimulation,
} from "./simulation";

/**
 * Measurements of the editor itself: how smoothly the canvas draws, how many
 * events the simulation gets through, how long input waits for a frame.
 *
 * Sampling runs in its own animation-frame loop, only while something is
 * subscribed, and a snapshot is published every `PUBLISH_MS` — never per
 * frame. That cadence is the point: a monitor that re-rendered React on every
 * frame would add its own cost to the frame times it reports.
 *
 * "FPS" is the cadence of `requestAnimationFrame` callbacks, which is what
 * every in-page meter can see; a frame the compositor produced without the
 * main thread is invisible to it, and a long task shows up as a long frame.
 *
 * One store per simulation, so a preview's monitor counts its own circuit's
 * events rather than the editor's. Frame times and latency are the page's and
 * read the same in every store.
 */

export const PUBLISH_MS = 500;
/** Published samples kept for the sparklines — 30 s at `PUBLISH_MS`. */
export const HISTORY_LENGTH = 60;

const FRAME_WINDOW = 240;
const LATENCY_WINDOW = 60;
/** Publishes the long-task count is summed over — 10 s. */
const LONG_TASK_WINDOW = 20;
/**
 * A gap this long is a hidden tab or a breakpoint. It says nothing about how
 * the page draws, and one such sample would sink every average for seconds.
 */
const MAX_FRAME_GAP_MS = 1000;
/** A frame is counted as dropped when it took this much longer than typical. */
const DROPPED_FRAME_FACTOR = 1.5;

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel"];

export type Spread = { avg: number; p95: number; max: number };

export type PerformanceSnapshot = {
  /** False until the first publish; every number below is a placeholder. */
  sampled: boolean;
  fps: number;
  /** The frame rate the 99th-percentile frame time implies — the "1% low". */
  lowFps: number;
  frameMs: Spread;
  refreshHz: number;
  droppedPercent: number;
  /** Null where the browser does not report long tasks (outside Chromium). */
  longTasks: { count: number; totalMs: number } | null;
  heapMb: { used: number; limit: number } | null;
  /** Input to the next frame. Null until something has been touched. */
  latencyMs: (Spread & { last: number; samples: number }) | null;
  sim: {
    ready: boolean;
    running: boolean;
    eventsPerSecond: number;
    framesPerSecond: number;
    eventsPerFrame: number;
    achievedNsPerSecond: number;
    targetNsPerSecond: number;
    /** Achieved over requested speed. Null while paused. */
    speedPercent: number | null;
    /** Real time one simulation frame spent in the engine. Null with no frames. */
    costMs: { avg: number; max: number } | null;
    saturatedPercent: number;
    pendingEvents: number;
    timeNs: number;
    nodes: number;
    nets: number;
  };
  /** Oldest first, one entry per publish. `NaN` marks an interval with no data. */
  history: {
    fps: readonly number[];
    tps: readonly number[];
    latency: readonly number[];
    cost: readonly number[];
  };
};

const EMPTY_SNAPSHOT: PerformanceSnapshot = {
  sampled: false,
  fps: 0,
  lowFps: 0,
  frameMs: { avg: 0, p95: 0, max: 0 },
  refreshHz: 0,
  droppedPercent: 0,
  longTasks: null,
  heapMb: null,
  latencyMs: null,
  sim: {
    ready: false,
    running: false,
    eventsPerSecond: 0,
    framesPerSecond: 0,
    eventsPerFrame: 0,
    achievedNsPerSecond: 0,
    targetNsPerSecond: 0,
    speedPercent: null,
    costMs: null,
    saturatedPercent: 0,
    pendingEvents: 0,
    timeNs: 0,
    nodes: 0,
    nets: 0,
  },
  history: { fps: [], tps: [], latency: [], cost: [] },
};

type PerformanceStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PerformanceSnapshot;
};

function createPerformanceStore(
  readCounters: (into: SimulationCounters) => SimulationCounters,
): PerformanceStore {
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_SNAPSHOT;

  const frameTimes = new RollingWindow(FRAME_WINDOW);
  const latencies = new RollingWindow(LATENCY_WINDOW);
  const longTaskCounts = new RollingWindow(LONG_TASK_WINDOW);
  const longTaskDurations = new RollingWindow(LONG_TASK_WINDOW);
  const fpsHistory = new RollingWindow(HISTORY_LENGTH);
  const tpsHistory = new RollingWindow(HISTORY_LENGTH);
  const latencyHistory = new RollingWindow(HISTORY_LENGTH);
  const costHistory = new RollingWindow(HISTORY_LENGTH);

  const counters = createSimulationCounters();
  const previous = createSimulationCounters();

  let handle: number | null = null;
  let lastFrameAt: number | null = null;
  let publishedAt = 0;
  let framesSincePublish = 0;
  let pendingInputAt: number | null = null;
  let intervalLatencySum = 0;
  let intervalLatencyCount = 0;
  let intervalMaxCost = 0;
  let seenSimFrames = 0;
  let intervalLongTasks = 0;
  let intervalLongTaskMs = 0;
  let longTaskObserver: PerformanceObserver | null = null;

  function onInput(event: Event) {
    // The first unanswered input is the one that has waited longest; a burst
    // of pointer moves inside one frame is one wait, not many.
    if (pendingInputAt === null) pendingInputAt = event.timeStamp;
  }

  function onFrame(frameAt: number) {
    handle = requestAnimationFrame(onFrame);

    if (lastFrameAt !== null) {
      const delta = frameAt - lastFrameAt;
      if (delta > 0 && delta < MAX_FRAME_GAP_MS) frameTimes.push(delta);
    }
    lastFrameAt = frameAt;
    framesSincePublish++;

    if (pendingInputAt !== null) {
      // `performance.now()` rather than the frame timestamp, which marks the
      // start of the frame and can precede an input dispatched within it.
      const waited = Math.max(0, performance.now() - pendingInputAt);
      pendingInputAt = null;
      latencies.push(waited);
      intervalLatencySum += waited;
      intervalLatencyCount++;
    }

    readCounters(counters);
    if (counters.frames !== seenSimFrames) {
      seenSimFrames = counters.frames;
      intervalMaxCost = Math.max(intervalMaxCost, counters.lastFrameCostMs);
    }

    const elapsed = frameAt - publishedAt;
    if (elapsed >= MAX_FRAME_GAP_MS * 2) {
      // Back from a hidden tab: rates over that gap would be averages of
      // nothing, so start the interval again instead of publishing them.
      rebaseline(frameAt);
    } else if (elapsed >= PUBLISH_MS) {
      publish(frameAt, elapsed);
    }
  }

  function rebaseline(at: number) {
    publishedAt = at;
    framesSincePublish = 0;
    intervalLatencySum = 0;
    intervalLatencyCount = 0;
    intervalMaxCost = 0;
    intervalLongTasks = 0;
    intervalLongTaskMs = 0;
    readCounters(previous);
    seenSimFrames = previous.frames;
  }

  function publish(at: number, elapsedMs: number) {
    const seconds = elapsedMs / 1000;
    const simFrames = counters.frames - previous.frames;
    const events = counters.events - previous.events;
    const simulatedNs = counters.simulatedNs - previous.simulatedNs;
    const cost = counters.costMs - previous.costMs;
    const saturated = counters.saturatedFrames - previous.saturatedFrames;

    const fps = framesSincePublish / seconds;
    const eventsPerSecond = counters.running ? events / seconds : 0;
    const achievedNsPerSecond = simulatedNs / seconds;
    const costAvg = simFrames > 0 ? cost / simFrames : Number.NaN;
    const latencyAvg =
      intervalLatencyCount > 0
        ? intervalLatencySum / intervalLatencyCount
        : Number.NaN;

    fpsHistory.push(fps);
    tpsHistory.push(eventsPerSecond);
    latencyHistory.push(latencyAvg);
    costHistory.push(costAvg);
    longTaskCounts.push(intervalLongTasks);
    longTaskDurations.push(intervalLongTaskMs);

    const typicalFrame = frameTimes.percentile(50);
    const worstPercentile = frameTimes.percentile(99);

    snapshot = {
      sampled: true,
      fps,
      lowFps: worstPercentile > 0 ? 1000 / worstPercentile : 0,
      frameMs: {
        avg: frameTimes.mean(),
        p95: frameTimes.percentile(95),
        max: frameTimes.max(),
      },
      refreshHz: typicalFrame > 0 ? 1000 / typicalFrame : 0,
      droppedPercent:
        frameTimes.size > 0
          ? (frameTimes.countAbove(typicalFrame * DROPPED_FRAME_FACTOR) /
              frameTimes.size) *
            100
          : 0,
      longTasks: longTaskObserver
        ? { count: longTaskCounts.sum(), totalMs: longTaskDurations.sum() }
        : null,
      heapMb: readHeap(),
      latencyMs:
        latencies.size > 0
          ? {
              last: latencies.latest(),
              avg: latencies.mean(),
              p95: latencies.percentile(95),
              max: latencies.max(),
              samples: latencies.size,
            }
          : null,
      sim: {
        ready: counters.ready,
        running: counters.running,
        eventsPerSecond,
        framesPerSecond: counters.running ? simFrames / seconds : 0,
        eventsPerFrame: simFrames > 0 ? events / simFrames : 0,
        achievedNsPerSecond,
        targetNsPerSecond: counters.speedNsPerSecond,
        speedPercent:
          counters.running && counters.speedNsPerSecond > 0
            ? (achievedNsPerSecond / counters.speedNsPerSecond) * 100
            : null,
        costMs: simFrames > 0 ? { avg: costAvg, max: intervalMaxCost } : null,
        saturatedPercent: simFrames > 0 ? (saturated / simFrames) * 100 : 0,
        pendingEvents: counters.pendingEvents,
        timeNs: counters.timeNs,
        nodes: counters.nodes,
        nets: counters.nets,
      },
      history: {
        fps: fpsHistory.toArray(),
        tps: tpsHistory.toArray(),
        latency: latencyHistory.toArray(),
        cost: costHistory.toArray(),
      },
    };

    rebaseline(at);
    for (const listener of listeners) listener();
  }

  function start() {
    for (const type of INPUT_EVENTS) {
      window.addEventListener(type, onInput, { capture: true, passive: true });
    }

    if (PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          intervalLongTasks++;
          intervalLongTaskMs += entry.duration;
        }
      });
      longTaskObserver.observe({ type: "longtask" });
    }

    lastFrameAt = null;
    rebaseline(performance.now());
    handle = requestAnimationFrame(onFrame);
  }

  function stop() {
    if (handle !== null) cancelAnimationFrame(handle);
    handle = null;
    for (const type of INPUT_EVENTS) {
      window.removeEventListener(type, onInput, { capture: true });
    }
    longTaskObserver?.disconnect();
    longTaskObserver = null;
    pendingInputAt = null;

    for (const window of [
      frameTimes,
      latencies,
      longTaskCounts,
      longTaskDurations,
      fpsHistory,
      tpsHistory,
      latencyHistory,
      costHistory,
    ]) {
      window.clear();
    }
    snapshot = EMPTY_SNAPSHOT;
  }

  return {
    subscribe: (listener) => {
      if (listeners.size === 0) start();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    getSnapshot: () => snapshot,
  };
}

function readHeap(): PerformanceSnapshot["heapMb"] {
  // Chromium only, and deliberately coarse there; absent is the honest answer
  // everywhere else.
  const memory = (
    performance as {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }
  ).memory;
  if (!memory) return null;
  return {
    used: memory.usedJSHeapSize / 1_048_576,
    limit: memory.jsHeapSizeLimit / 1_048_576,
  };
}

/** Weak, so a preview's store goes when its simulation does. */
const stores = new WeakMap<Simulation, PerformanceStore>();

function storeFor(simulation: Simulation): PerformanceStore {
  let store = stores.get(simulation);
  if (!store) {
    store = createPerformanceStore(simulation.readCounters);
    stores.set(simulation, store);
  }
  return store;
}

/** Samples the simulation the nearest `SimulationContext` provides. */
export function usePerformanceSnapshot(): PerformanceSnapshot {
  const store = storeFor(useSimulation());
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => EMPTY_SNAPSHOT,
  );
}
