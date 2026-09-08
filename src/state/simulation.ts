"use client";

import { useSyncExternalStore } from "react";

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
} from "@/lib/sim/runner";
import type { WaveformSample } from "@/lib/sim/waveform";

/**
 * The compiled circuit and the thing running it, for the open document.
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
 */

let netlist: Netlist | null = null;
let engine: Engine | null = null;
let runner: Runner | null = null;

/** What the current engine was compiled from — the rebuild test. */
let signature = "";
/** Params the engine holds per node, so a live update knows what changed. */
let engineParams = new Map<string, NodeParams>();

const listeners = new Set<() => void>();

/**
 * Monotonic across engine rebuilds, unlike `Engine.version`, which restarts at
 * zero every time one is constructed. The hooks key their caches off it.
 */
let revision = 0;

let lookup: NodeLookup = lookupNode;
/** `lookup` plus the open document's subcircuits. Rebuilt on every sync. */
let documentLookup: NodeLookup = lookupNode;
let runnerOptions: RunnerOptions = {};

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

/**
 * Runs a paused circuit out to a stable state. A no-op while running, where
 * the runner is already advancing time every frame.
 *
 * Event by event rather than one `runUntil` to the deadline, so simulated time
 * lands on the last event that actually happened instead of jumping the whole
 * leash forward every time — a reset should read `2 ns`, not `10 µs`.
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

/**
 * Rebuilds the netlist and, when the topology actually moved, the engine.
 *
 * Called on every document change, including every frame of a drag — which is
 * why the cheap path matters: moving a node recompiles the netlist (positions
 * are not in it, so the signature comes out identical) and stops there.
 */
export function syncDocument(document: CircuitDocument | null): void {
  if (!document) {
    disposeSimulation();
    return;
  }

  // The document's own chips are node types too, so the lookup the engine is
  // built from is derived per document rather than being the bare registry.
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
  const speed = runner?.speedNsPerSecond ?? DEFAULT_SPEED_NS_PER_SECOND;

  runner?.dispose();

  netlist = compiled;
  signature = nextSignature;
  engine = new Engine(compiled, documentLookup);
  engineParams = new Map(compiled.nodes.map((node) => [node.id, node.params]));

  runner = new Runner(engine, { ...runnerOptions, speedNsPerSecond: speed });
  runner.subscribe(emit);

  // An edit made while running keeps running — the alternative is that wiring
  // one gate silently stops the clock the user was watching.
  if (wasRunning) runner.play();
  else settleIfPaused();

  emit();
}

function sameParams(a: NodeParams, b: NodeParams): boolean {
  if (a === b) return true;

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;

  // Params are JSON, and the values in play are scalars; a nested object
  // compares unequal here and costs one extra evaluation, never a wrong answer.
  return keys.every((key) => Object.is(a[key], b[key]));
}

export function disposeSimulation(): void {
  runner?.dispose();
  runner = null;
  engine = null;
  netlist = null;
  signature = "";
  engineParams = new Map();
  emit();
}

export function getNetlist(): Netlist | null {
  return netlist;
}

export function getEngine(): Engine | null {
  return engine;
}

/**
 * Recorded samples for one node channel, oldest first.
 *
 * Not a `useSyncExternalStore` snapshot: it allocates, so comparing it with
 * `Object.is` would re-render forever. A view pairs it with
 * `useSimulationRevision`, which *is* a comparable snapshot, and reads this
 * during the render that revision triggers.
 */
export function readWaveform(
  nodeId: string,
  channel: string,
): WaveformSample[] {
  return engine?.waveform(nodeId, channel) ?? [];
}

/** Bumped once per frame the simulation changed anything. */
export function useSimulationRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => revision,
    () => 0,
  );
}

/** Test seam: a `FrameScheduler` and a lookup that do not need a browser. */
export function configureSimulation(options: {
  lookup?: NodeLookup;
  runner?: RunnerOptions;
}): void {
  if (options.lookup) lookup = options.lookup;
  if (options.runner) runnerOptions = options.runner;
}

export function play(): void {
  runner?.play();
}

export function pause(): void {
  runner?.pause();
}

export function togglePlay(): void {
  if (!runner) return;
  if (runner.mode === "running") runner.pause();
  else runner.play();
}

/** One event's worth of simulated time, paused. */
export function stepSimulation(): void {
  runner?.step();
}

export function resetSimulation(): void {
  runner?.reset();
  settleIfPaused();
}

export function setSimulationSpeed(nsPerSecond: number): void {
  runner?.setSpeed(nsPerSecond);
  emit();
}

/**
 * The value on a net, MSB first: `"0"`, `"1"`, `"X"`, `"Z"`, `"1011"`.
 *
 * A string rather than a `Signal` on purpose. `useSyncExternalStore` compares
 * snapshots with `Object.is`, and a fresh `Uint8Array` per call would never
 * compare equal and would re-render forever. It is also what the UI wants —
 * every consumer either draws it or measures its length.
 */
export function readNetValue(netId: number | null): string {
  if (engine === null || netId === null) return "";
  return formatSignal(engine.readNet(netId));
}

export function readPinValue(nodeId: string, pinId: string): string {
  if (!engine || !netlist) return "";

  const netId = netlist.pinToNet[pinKey(nodeId, pinId)];
  return netId === undefined ? "" : formatSignal(engine.readNet(netId));
}

/** Subscribes to one net. A LED using this does not re-render the canvas. */
export function useNetValue(netId: number | null): string {
  return useSyncExternalStore(
    subscribe,
    () => readNetValue(netId),
    () => "",
  );
}

export function usePinValue(nodeId: string, pinId: string): string {
  return useSyncExternalStore(
    subscribe,
    () => readPinValue(nodeId, pinId),
    () => "",
  );
}

/**
 * Every pin of one node, in pin order, space-separated: the per-*node*
 * subscription the architecture allows. A node view needs all its pins at
 * once, and one subscription yielding a comparable string beats one per pin.
 */
export function useNodeValues(nodeId: string, pinIds: readonly string[]) {
  // Joined into the closure's dependency rather than captured as an array, so
  // a fresh array of the same pin ids does not resubscribe.
  const key = pinIds.join(" ");

  return useSyncExternalStore(
    subscribe,
    () =>
      key.length === 0
        ? ""
        : key
            .split(" ")
            .map((pinId) => readPinValue(nodeId, pinId))
            .join(" "),
    () => "",
  );
}

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

const IDLE_STATUS: SimulationStatus = {
  ready: false,
  mode: "paused",
  time: 0,
  speedNsPerSecond: DEFAULT_SPEED_NS_PER_SECOND,
  achievedNsPerSecond: 0,
  errorCount: 0,
  warningCount: 0,
};

/** Cached against `revision`, because the hook needs a stable reference. */
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

export function useSimulationStatus(): SimulationStatus {
  return useSyncExternalStore(subscribe, getStatus, () => IDLE_STATUS);
}

const NO_DIAGNOSTICS: Diagnostic[] = [];

let diagnosticsRevision = -1;
let diagnostics: Diagnostic[] = NO_DIAGNOSTICS;

export function getDiagnostics(): Diagnostic[] {
  if (diagnosticsRevision === revision) return diagnostics;
  diagnosticsRevision = revision;
  diagnostics = engine ? engine.diagnostics : NO_DIAGNOSTICS;
  return diagnostics;
}

export function useDiagnostics(): Diagnostic[] {
  return useSyncExternalStore(subscribe, getDiagnostics, () => NO_DIAGNOSTICS);
}
