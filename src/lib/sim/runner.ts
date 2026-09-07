import type { AdvanceResult, Engine } from "./engine";

/**
 * Drives the engine against real time, one frame at a time.
 *
 * This is the only part of the simulation that knows real time exists, and the
 * only writer of simulation state that React observes. It notifies subscribers
 * **once per frame**, never per event — a 1 MHz clock produces two million
 * events a second and no UI can or should see them individually.
 * See artifacts/04-simulation-engine.md.
 */

export type RunnerMode = "running" | "paused";

/**
 * The seam that keeps `src/lib/` free of the DOM. The default reads
 * `requestAnimationFrame` off `globalThis` at call time, so a Node test
 * injects a fake and drives frames by hand instead of waiting for a browser.
 */
export type FrameScheduler = {
  request: (callback: (timeMs: number) => void) => number;
  cancel: (handle: number) => void;
};

export type RunnerOptions = {
  /** Simulated nanoseconds per real second. 1e9 is real time. */
  speedNsPerSecond?: number;
  /** Events one frame may process before it yields and reports a slow rate. */
  eventBudgetPerFrame?: number;
  frames?: FrameScheduler;
};

/** 1 µs of simulated time per real second: slow enough for a gate to be visible. */
export const DEFAULT_SPEED_NS_PER_SECOND = 1_000;

const DEFAULT_EVENT_BUDGET_PER_FRAME = 20_000;

/**
 * A frame longer than this is a backgrounded tab or a breakpoint, not a slow
 * machine. Simulating the gap would hang; skipping it keeps sim time honest.
 */
const MAX_FRAME_MS = 100;

function browserFrames(): FrameScheduler {
  return {
    request: (callback) => {
      const raf = (
        globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }
      ).requestAnimationFrame;
      if (!raf) {
        throw new Error(
          "No requestAnimationFrame in this environment; pass a FrameScheduler.",
        );
      }
      return raf(callback);
    },
    cancel: (handle) => {
      (
        globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }
      ).cancelAnimationFrame?.(handle);
    },
  };
}

export class Runner {
  private readonly engine: Engine;
  private readonly frames: FrameScheduler;
  private readonly eventBudget: number;

  private currentMode: RunnerMode = "paused";
  private speed: number;
  private handle: number | null = null;
  private lastFrameMs: number | null = null;
  private listeners = new Set<() => void>();

  /** Simulated ns actually advanced in the last real second, for the UI. */
  private achieved = 0;

  constructor(engine: Engine, options: RunnerOptions = {}) {
    this.engine = engine;
    this.frames = options.frames ?? browserFrames();
    this.speed = options.speedNsPerSecond ?? DEFAULT_SPEED_NS_PER_SECOND;
    this.eventBudget =
      options.eventBudgetPerFrame ?? DEFAULT_EVENT_BUDGET_PER_FRAME;
  }

  get mode(): RunnerMode {
    return this.currentMode;
  }

  get speedNsPerSecond(): number {
    return this.speed;
  }

  /**
   * Simulated ns per real second the last frame actually managed. Below
   * `speedNsPerSecond` means the circuit is outrunning the machine — report
   * that in the UI rather than silently falling behind.
   */
  get achievedNsPerSecond(): number {
    return this.achieved;
  }

  /** `useSyncExternalStore` pair. The snapshot is the engine's version. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): number => this.engine.version;

  setSpeed(nsPerSecond: number): void {
    this.speed = Math.max(0, nsPerSecond);
  }

  play(): void {
    if (this.currentMode === "running") return;
    this.currentMode = "running";
    // Cleared so the first frame after a pause measures from itself rather
    // than simulating however long the user spent paused.
    this.lastFrameMs = null;
    this.requestFrame();
    this.notify();
  }

  pause(): void {
    if (this.handle !== null) {
      this.frames.cancel(this.handle);
      this.handle = null;
    }
    this.currentMode = "paused";
    this.achieved = 0;
    this.notify();
  }

  /** One event's worth of simulated time, paused. The debugger's step button. */
  step(): AdvanceResult {
    this.pause();
    const result = this.engine.step();
    this.notify();
    return result;
  }

  /** Advances a fixed span of simulated time, paused. */
  advance(ns: number): AdvanceResult {
    this.pause();
    const result = this.engine.runUntil(this.engine.now + Math.max(0, ns));
    this.notify();
    return result;
  }

  reset(): void {
    this.pause();
    this.engine.reset();
    this.notify();
  }

  dispose(): void {
    this.pause();
    this.listeners.clear();
  }

  /** Exposed so a test can drive frames without a browser. */
  onFrame(timeMs: number): void {
    if (this.currentMode !== "running") return;

    const elapsedMs =
      this.lastFrameMs === null
        ? 0
        : Math.min(MAX_FRAME_MS, timeMs - this.lastFrameMs);
    this.lastFrameMs = timeMs;

    // Integer nanoseconds all the way through: a fractional target would make
    // the reachable event times depend on frame timing, and the engine's
    // determinism is the whole point.
    const target =
      this.engine.now + Math.trunc((elapsedMs / 1000) * this.speed);
    const before = this.engine.now;
    const result = this.engine.runUntil(target, this.eventBudget);

    // Measured from what the engine actually advanced, not from what was
    // asked for: a frame that hit the event budget fell behind, and the UI
    // should say so rather than claim the requested speed.
    this.achieved =
      elapsedMs > 0 ? ((this.engine.now - before) / elapsedMs) * 1000 : 0;

    if (result.oscillating) {
      // Already reported as a diagnostic with the nets forced to X; running on
      // would re-report it every frame and never get anywhere.
      this.pause();
      return;
    }

    this.requestFrame();
    this.notify();
  }

  private requestFrame(): void {
    this.handle = this.frames.request((timeMs) => {
      this.handle = null;
      this.onFrame(timeMs);
    });
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
