"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

import type { Diagnostic } from "@/lib/circuit/netlist";
import { buildNetlist, type Netlist, pinKey } from "@/lib/circuit/netlist";
import type { CircuitDocument } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import type { NodeLookup, NodeParams } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { formatSignal } from "@/lib/sim/logic";
import {
  DEFAULT_SPEED_NS_PER_SECOND,
  Runner,
  type RunnerMode,
  type RunnerOptions,
  type RunnerStats,
} from "@/lib/sim/runner";
import type { WaveformSample } from "@/lib/sim/waveform";

/**
 * The compiled circuit and the thing running it, for one document.
 *
 * This is the React to simulation boundary described in
 * artifacts/02-architecture.md. The engine owns the net values and never calls
 * `setState`; the runner notifies once per frame; components subscribe **per
 * net or per node** through the hooks at the bottom of this file, so a LED
 * changing does not re-render the canvas.
 *
 * It also owns the other half of the editing/running split: an edit is pushed
 * in through `syncDocument`, which decides between a rebuild and a live param
 * update. That decision lives here because it is the only place that knows
 * both what the document now says and what the engine was built from.
 *
 * A factory, not module state: the editor runs the default instance, and a
 * `CircuitPreview` runs one of its own beside it. The hooks read whichever
 * instance the nearest `SimulationContext` provides, so a node view never
 * knows which it is drawing for.
 */

/**
 * Simulated time a paused engine is allowed to advance so the canvas shows a
 * settled circuit.
 *
 * The engine is event-driven: a gate reacts one nanosecond after its input
 * moves, so at `t = 0` nothing downstream of a source has run yet and every
 * wire would read `X` until the user pressed play. Editing a paused circuit
 * and seeing nothing happen is not a useful editor, so an edit runs the clock
 * on a short leash. The leash matters: a free-running oscillator would
 * otherwise simulate forever on every keystroke.
 */
const SETTLE_NS = 10_000;
const SETTLE_EVENT_BUDGET = 10_000;

/** Frame costs for the performance monitor. Absent during SSR. */
const wallClock =
  typeof performance === "undefined" ? undefined : () => performance.now();

type RunnerTotals = Omit<RunnerStats, "lastFrameCostMs">;

/** Totals across every runner an instance has had, plus the live circuit's shape. */
export type SimulationCounters = RunnerStats & {
  ready: boolean;
  running: boolean;
  speedNsPerSecond: number;
  pendingEvents: number;
  timeNs: number;
  nodes: number;
  nets: number;
};

export type SimulationStatus = {
  ready: boolean;
  mode: RunnerMode;
  /** Simulated nanoseconds. */
  time: number;
  speedNsPerSecond: number;
  /** Below `speedNsPerSecond` means the circuit is outrunning the machine. */
  achievedNsPerSecond: number;
  errorCount: number;
  warningCount: number;
};

export type SimulationOptions = {
  lookup?: NodeLookup;
  /** `speedNsPerSecond` here is the speed the first runner starts at. */
  runner?: RunnerOptions;
};

export type Simulation = {
  subscribe: (listener: () => void) => () => void;
  /** Rebuilds the netlist and, when the topology actually moved, the engine. */
  syncDocument: (document: CircuitDocument | null) => void;
  dispose: () => void;
  /** Test seam: a `FrameScheduler` and a lookup that do not need a browser. */
  configure: (options: SimulationOptions) => void;
  readCounters: (into: SimulationCounters) => SimulationCounters;
  getNetlist: () => Netlist | null;
  getEngine: () => Engine | null;
  /** Bumped once per frame the simulation changed anything. */
  getRevision: () => number;
  getStatus: () => SimulationStatus;
  getDiagnostics: () => Diagnostic[];
  readWaveform: (nodeId: string, channel: string) => WaveformSample[];
  readNetValue: (netId: number | null) => string;
  readPinValue: (nodeId: string, pinId: string) => string;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  /** One event's worth of simulated time, paused. */
  step: () => void;
  reset: () => void;
  setSpeed: (nsPerSecond: number) => void;
};

const IDLE_STATUS: SimulationStatus = {
  ready: false,
  mode: "paused",
  time: 0,
  speedNsPerSecond: DEFAULT_SPEED_NS_PER_SECOND,
  achievedNsPerSecond: 0,
  errorCount: 0,
  warningCount: 0,
};

const NO_DIAGNOSTICS: Diagnostic[] = [];

export function createSimulation(options: SimulationOptions = {}): Simulation {
  let netlist: Netlist | null = null;
  let engine: Engine | null = null;
  let runner: Runner | null = null;

  /** What the current engine was compiled from — the rebuild test. */
  let signature = "";
  /** Params the engine holds per node, so a live update knows what changed. */
  let engineParams = new Map<string, NodeParams>();

  const listeners = new Set<() => void>();

  /**
   * Monotonic across engine rebuilds, unlike `Engine.version`, which restarts
   * at zero every time one is constructed. The hooks key their caches off it.
   */
  let revision = 0;

  let lookup: NodeLookup = options.lookup ?? lookupNode;
  /** `lookup` plus the open document's subcircuits. Rebuilt on every sync. */
  let documentLookup: NodeLookup = lookup;
  let runnerOptions: RunnerOptions = options.runner ?? {};

  /**
   * What runners already thrown away had counted. An edit rebuilds the runner,
   * and totals that dropped to zero on every wire drawn would read as a
   * negative rate to anything sampling them.
   */
  const retired: RunnerTotals = {
    frames: 0,
    events: 0,
    simulatedNs: 0,
    costMs: 0,
    saturatedFrames: 0,
  };

  function retireRunner(): void {
    if (!runner) return;
    const stats = runner.stats;
    retired.frames += stats.frames;
    retired.events += stats.events;
    retired.simulatedNs += stats.simulatedNs;
    retired.costMs += stats.costMs;
    retired.saturatedFrames += stats.saturatedFrames;
  }

  /**
   * Runs a paused circuit out to a stable state. A no-op while running, where
   * the runner is already advancing time every frame.
   *
   * Event by event rather than one `runUntil` to the deadline, so simulated
   * time lands on the last event that actually happened instead of jumping the
   * whole leash forward every time — a reset should read `2 ns`, not `10 µs`.
   */
  function settleIfPaused() {
    if (!engine || runner?.mode === "running") return;

    const deadline = engine.now + SETTLE_NS;
    let events = 0;

    while (engine.now < deadline && events < SETTLE_EVENT_BUDGET) {
      const result = engine.step();
      if (result.events === 0 || result.oscillating) break;
      events += result.events;
    }
  }

  function emit() {
    revision++;
    for (const listener of listeners) listener();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  /**
   * Called on every document change, including every frame of a drag — which
   * is why the cheap path matters: moving a node recompiles the netlist
   * (positions are not in it, so the signature comes out identical) and stops
   * there.
   */
  function syncDocument(document: CircuitDocument | null): void {
    if (!document) {
      dispose();
      return;
    }

    // The document's own chips are node types too, so the lookup the engine
    // is built from is derived per document rather than being the bare
    // registry.
    documentLookup = subcircuitLookup(document, lookup);

    const compiled = buildNetlist(document, documentLookup);
    const nextSignature = topologySignature(compiled, documentLookup);

    if (!engine || nextSignature !== signature) {
      rebuild(compiled, nextSignature);
      return;
    }

    netlist = compiled;

    // Same shape, so the engine survives: hand it whatever params changed and
    // let it re-evaluate those nodes at the current simulated time.
    let changed = false;
    for (const node of compiled.nodes) {
      const previous = engineParams.get(node.id);
      if (previous && sameParams(previous, node.params)) continue;

      engineParams.set(node.id, node.params);
      engine.setNodeParams(node.id, node.params);
      changed = true;
    }

    // A switch flipped while paused must still light the LED downstream of it.
    if (changed) {
      settleIfPaused();
      emit();
    }
  }

  function rebuild(compiled: Netlist, nextSignature: string): void {
    const wasRunning = runner?.mode === "running";
    const speed =
      runner?.speedNsPerSecond ??
      runnerOptions.speedNsPerSecond ??
      DEFAULT_SPEED_NS_PER_SECOND;

    retireRunner();
    runner?.dispose();

    netlist = compiled;
    signature = nextSignature;
    engine = new Engine(compiled, documentLookup);
    engineParams = new Map(
      compiled.nodes.map((node) => [node.id, node.params]),
    );

    runner = new Runner(engine, {
      clock: wallClock,
      ...runnerOptions,
      speedNsPerSecond: speed,
    });
    runner.subscribe(emit);

    // An edit made while running keeps running — the alternative is that
    // wiring one gate silently stops the clock the user was watching.
    if (wasRunning) runner.play();
    else settleIfPaused();

    emit();
  }

  function dispose(): void {
    retireRunner();
    runner?.dispose();
    runner = null;
    engine = null;
    netlist = null;
    signature = "";
    engineParams = new Map();
    emit();
  }

  /**
   * Fills `into` rather than returning a fresh object: the performance monitor
   * reads this on every animation frame, and it should not be the thing
   * producing garbage while it measures jank. Not a React snapshot — nothing
   * here is comparable, and the monitor publishes on its own cadence.
   */
  function readCounters(into: SimulationCounters): SimulationCounters {
    const stats = runner?.stats;
    into.frames = retired.frames + (stats?.frames ?? 0);
    into.events = retired.events + (stats?.events ?? 0);
    into.simulatedNs = retired.simulatedNs + (stats?.simulatedNs ?? 0);
    into.costMs = retired.costMs + (stats?.costMs ?? 0);
    into.saturatedFrames =
      retired.saturatedFrames + (stats?.saturatedFrames ?? 0);
    into.lastFrameCostMs = stats?.lastFrameCostMs ?? 0;
    into.ready = engine !== null && runner !== null;
    into.running = runner?.mode === "running";
    into.speedNsPerSecond =
      runner?.speedNsPerSecond ?? DEFAULT_SPEED_NS_PER_SECOND;
    into.pendingEvents = engine?.pendingEvents ?? 0;
    into.timeNs = engine?.now ?? 0;
    into.nodes = netlist?.nodes.length ?? 0;
    into.nets = netlist?.nets.length ?? 0;
    return into;
  }

  /**
   * The value on a net, MSB first: `"0"`, `"1"`, `"X"`, `"Z"`, `"1011"`.
   *
   * A string rather than a `Signal` on purpose. `useSyncExternalStore`
   * compares snapshots with `Object.is`, and a fresh `Uint8Array` per call
   * would never compare equal and would re-render forever. It is also what the
   * UI wants — every consumer either draws it or measures its length.
   */
  function readNetValue(netId: number | null): string {
    if (engine === null || netId === null) return "";
    return formatSignal(engine.readNet(netId));
  }

  function readPinValue(nodeId: string, pinId: string): string {
    if (!engine || !netlist) return "";

    const netId = netlist.pinToNet[pinKey(nodeId, pinId)];
    return netId === undefined ? "" : formatSignal(engine.readNet(netId));
  }

  /** Cached against `revision`, because the hook needs a stable reference. */
  let diagnosticsRevision = -1;
  let diagnostics: Diagnostic[] = NO_DIAGNOSTICS;

  function getDiagnostics(): Diagnostic[] {
    if (diagnosticsRevision === revision) return diagnostics;
    diagnosticsRevision = revision;
    diagnostics = engine ? engine.diagnostics : NO_DIAGNOSTICS;
    return diagnostics;
  }

  let statusRevision = -1;
  let status: SimulationStatus = IDLE_STATUS;

  function getStatus(): SimulationStatus {
    if (statusRevision === revision) return status;
    statusRevision = revision;

    if (!engine || !runner) {
      status = IDLE_STATUS;
      return status;
    }

    const current = getDiagnostics();
    status = {
      ready: true,
      mode: runner.mode,
      time: engine.now,
      speedNsPerSecond: runner.speedNsPerSecond,
      achievedNsPerSecond: runner.achievedNsPerSecond,
      errorCount: current.filter((entry) => entry.severity === "error").length,
      warningCount: current.filter((entry) => entry.severity === "warning")
        .length,
    };
    return status;
  }

  return {
    subscribe,
    syncDocument,
    dispose,
    configure: (next) => {
      if (next.lookup) lookup = next.lookup;
      if (next.runner) runnerOptions = next.runner;
    },
    readCounters,
    getNetlist: () => netlist,
    getEngine: () => engine,
    getRevision: () => revision,
    getStatus,
    getDiagnostics,
    readWaveform: (nodeId, channel) => engine?.waveform(nodeId, channel) ?? [],
    readNetValue,
    readPinValue,
    play: () => runner?.play(),
    pause: () => runner?.pause(),
    togglePlay: () => {
      if (!runner) return;
      if (runner.mode === "running") runner.pause();
      else runner.play();
    },
    step: () => runner?.step(),
    reset: () => {
      runner?.reset();
      settleIfPaused();
    },
    setSpeed: (nsPerSecond) => {
      runner?.setSpeed(nsPerSecond);
      emit();
    },
  };
}

/**
 * Everything the engine's construction depends on: which nodes exist, the pins
 * they present, what those pins are wired to, and how long each node takes to
 * react. Params that only `evaluate` reads — a switch's position — are
 * deliberately absent, which is what makes flipping a switch a live update
 * rather than a rebuild that would wipe every latched value.
 */
function topologySignature(compiled: Netlist, lookupType: NodeLookup) {
  const parts: string[] = [];

  for (const node of compiled.nodes) {
    const delay = lookupType(node.type)?.delayNs?.(node.params) ?? "";
    parts.push(`${node.id} ${node.type} ${delay}`);
    for (const pin of node.pins) {
      parts.push(
        `${pin.id}:${pin.direction}:${pin.width}:${pin.tristate ? 1 : 0}:${node.pinNets[pin.id]}`,
      );
    }
  }

  return parts.join("");
}

function sameParams(a: NodeParams, b: NodeParams): boolean {
  if (a === b) return true;

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;

  // Params are JSON, and the values in play are scalars; a nested object
  // compares unequal here and costs one extra evaluation, never a wrong answer.
  return keys.every((key) => Object.is(a[key], b[key]));
}

export function createSimulationCounters(): SimulationCounters {
  return {
    frames: 0,
    events: 0,
    simulatedNs: 0,
    costMs: 0,
    saturatedFrames: 0,
    lastFrameCostMs: 0,
    ready: false,
    running: false,
    speedNsPerSecond: DEFAULT_SPEED_NS_PER_SECOND,
    pendingEvents: 0,
    timeNs: 0,
    nodes: 0,
    nets: 0,
  };
}

/** The editor's simulation — the open document's. */
const defaultSimulation = createSimulation();

/**
 * Which simulation the hooks below read. Unprovided, it is the editor's, so
 * nothing in the editor has to mount a provider.
 */
export const SimulationContext = createContext<Simulation>(defaultSimulation);

export function useSimulation(): Simulation {
  return useContext(SimulationContext);
}

// The editor's instance, as plain functions: what the editor, its shortcuts
// and the tests call.

export function syncDocument(document: CircuitDocument | null): void {
  defaultSimulation.syncDocument(document);
}

export function disposeSimulation(): void {
  defaultSimulation.dispose();
}

export function readSimulationCounters(
  into: SimulationCounters,
): SimulationCounters {
  return defaultSimulation.readCounters(into);
}

export function getNetlist(): Netlist | null {
  return defaultSimulation.getNetlist();
}

export function getEngine(): Engine | null {
  return defaultSimulation.getEngine();
}

export function configureSimulation(options: SimulationOptions): void {
  defaultSimulation.configure(options);
}

export function play(): void {
  defaultSimulation.play();
}

export function pause(): void {
  defaultSimulation.pause();
}

export function togglePlay(): void {
  defaultSimulation.togglePlay();
}

export function stepSimulation(): void {
  defaultSimulation.step();
}

export function resetSimulation(): void {
  defaultSimulation.reset();
}

export function setSimulationSpeed(nsPerSecond: number): void {
  defaultSimulation.setSpeed(nsPerSecond);
}

export function readNetValue(netId: number | null): string {
  return defaultSimulation.readNetValue(netId);
}

export function readPinValue(nodeId: string, pinId: string): string {
  return defaultSimulation.readPinValue(nodeId, pinId);
}

export function getDiagnostics(): Diagnostic[] {
  return defaultSimulation.getDiagnostics();
}

/**
 * Bumped once per frame the simulation changed anything.
 *
 * Recorded samples (`Simulation.readWaveform`) are not a snapshot: they
 * allocate, so comparing them with `Object.is` would re-render forever. A view
 * pairs this, which *is* comparable, with reading the samples during the
 * render it triggers.
 */
export function useSimulationRevision(): number {
  const simulation = useSimulation();
  return useSyncExternalStore(
    simulation.subscribe,
    simulation.getRevision,
    () => 0,
  );
}

/**
 * The compiled netlist, which changes identity on every sync. Coarse — for
 * whatever derives the scene from it, never for a per-frame reader.
 */
export function useNetlist(): Netlist | null {
  const simulation = useSimulation();
  return useSyncExternalStore(
    simulation.subscribe,
    simulation.getNetlist,
    () => null,
  );
}

/** Subscribes to one net. A LED using this does not re-render the canvas. */
export function useNetValue(netId: number | null): string {
  const simulation = useSimulation();
  return useSyncExternalStore(
    simulation.subscribe,
    () => simulation.readNetValue(netId),
    () => "",
  );
}

export function usePinValue(nodeId: string, pinId: string): string {
  const simulation = useSimulation();
  return useSyncExternalStore(
    simulation.subscribe,
    () => simulation.readPinValue(nodeId, pinId),
    () => "",
  );
}

/**
 * Every pin of one node, in pin order, space-separated: the per-*node*
 * subscription the architecture allows. A node view needs all its pins at
 * once, and one subscription yielding a comparable string beats one per pin.
 */
export function useNodeValues(nodeId: string, pinIds: readonly string[]) {
  const simulation = useSimulation();
  // Joined into the closure's dependency rather than captured as an array, so
  // a fresh array of the same pin ids does not resubscribe.
  const key = pinIds.join(" ");

  return useSyncExternalStore(
    simulation.subscribe,
    () =>
      key.length === 0
        ? ""
        : key
            .split(" ")
            .map((pinId) => simulation.readPinValue(nodeId, pinId))
            .join(" "),
    () => "",
  );
}

export function useSimulationStatus(): SimulationStatus {
  const simulation = useSimulation();
  return useSyncExternalStore(
    simulation.subscribe,
    simulation.getStatus,
    () => IDLE_STATUS,
  );
}

export function useDiagnostics(): Diagnostic[] {
  const simulation = useSimulation();
  return useSyncExternalStore(
    simulation.subscribe,
    simulation.getDiagnostics,
    () => NO_DIAGNOSTICS,
  );
}
