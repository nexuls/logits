import type { Diagnostic } from "@/lib/circuit/netlist";
import { type Netlist, type NetlistNode, pinKey } from "@/lib/circuit/netlist";
import type {
  EvalContext,
  NodeLookup,
  NodeParams,
  NodeState,
} from "@/lib/nodes/define";
import {
  createSignal,
  fitSignal,
  resolveDrivers,
  type Signal,
  signalsEqual,
  X,
  Z,
} from "./logic";
import { EventQueue } from "./queue";
import { WaveformRecorder, type WaveformSample } from "./waveform";

/**
 * The discrete-event simulation core.
 *
 * Pure TypeScript: no React, no DOM, and above all no wall-clock reads. Time
 * here is integer nanoseconds of *simulated* time, which is why the same
 * circuit produces the same waveform on a fast machine and a slow one. The
 * only thing that knows about real time is the runner.
 * See artifacts/04-simulation-engine.md.
 */

/** Nanoseconds from an input change to the reaction, unless a node says otherwise. */
export const DEFAULT_DELAY_NS = 1;

/**
 * Events one `runUntil` may process before it hands control back. Reaching it
 * is not an error — a fast clock legitimately makes millions of events a
 * second — so the advance simply stops where it got to and the caller comes
 * back. What it guarantees is that `runUntil` always returns.
 */
export const MAX_EVENTS_PER_ADVANCE = 100_000;

/**
 * Events at a single timestamp before the circuit is declared oscillating.
 *
 * This, not the advance budget, is what an oscillation actually is: a
 * combinational loop of zero-delay nodes feeding itself at one instant, so
 * simulated time can never move and no amount of patience would help. A
 * circuit that is merely busy still advances its clock and is not accused.
 * Well above the few thousand simultaneous events a reset of a large circuit
 * produces. See artifacts/decisions/0005-oscillation-is-zero-delay-churn.md.
 */
export const MAX_EVENTS_PER_INSTANT = 50_000;

export type AdvanceResult = {
  /** Events processed. Below the budget, and the queue is drained to `time`. */
  events: number;
  /** True when nothing is left to do at or before the requested time. */
  settled: boolean;
  /**
   * True when the run stopped because the circuit is churning at one instant.
   * A merely busy advance comes back `settled: false, oscillating: false`.
   */
  oscillating: boolean;
};

type Driver = {
  net: number;
  node: number;
  pinId: string;
  width: number;
  value: Signal;
};

type Reader = { node: number; pinId: string };

type NodeRuntime = {
  index: number;
  netlistNode: NetlistNode;
  /** Undefined for a node type the registry has lost, or a pure sink. */
  evaluate: ((ctx: EvalContext) => void) | undefined;
  delayNs: number;
  createState: ((params: NodeParams) => NodeState) | undefined;
  state: NodeState;
  /**
   * Held here rather than read off the netlist node, so `setNodeParams` can
   * change a switch's position without rebuilding — and without mutating the
   * netlist, which is derived and shared.
   */
  params: NodeParams;
  /** Driver index for each output pin, so `write` is a lookup, not a scan. */
  driversByPin: Record<string, number>;
  pinWidths: Record<string, number>;
};

export class Engine {
  readonly netlist: Netlist;

  private readonly queue = new EventQueue();
  private readonly nodes: NodeRuntime[] = [];
  private readonly drivers: Driver[] = [];
  private readonly netDrivers: number[][];
  private readonly netValues: Signal[];
  private readonly netReaders: Reader[][];
  /** Backs `emitSample`; cleared on reset, like every other piece of state. */
  private readonly recorder = new WaveformRecorder();

  private currentTime = 0;
  private currentVersion = 0;
  private runtimeDiagnostics: Diagnostic[] = [];

  /** Per-net change counter for the current advance — the oscillation witness. */
  private churn: Int32Array;

  constructor(netlist: Netlist, lookup: NodeLookup) {
    this.netlist = netlist;

    this.netValues = netlist.nets.map((net) => createSignal(net.width, Z));
    this.netDrivers = netlist.nets.map(() => []);
    this.churn = new Int32Array(netlist.nets.length);

    const indexOfNode = new Map(
      netlist.nodes.map((node, index) => [node.id, index]),
    );

    // Readers are stored per net with their node index resolved once, because
    // this list is walked on every net change — the engine's hot path.
    this.netReaders = netlist.nets.map((net) =>
      net.readers.map((pin) => ({
        node: indexOfNode.get(pin.nodeId) ?? -1,
        pinId: pin.pinId,
      })),
    );

    for (const [index, netlistNode] of netlist.nodes.entries()) {
      const definition = lookup(netlistNode.type);
      const driversByPin: Record<string, number> = {};
      const pinWidths: Record<string, number> = {};

      for (const pin of netlistNode.pins) {
        pinWidths[pin.id] = pin.width;
        if (pin.direction === "in") continue;

        const net = netlistNode.pinNets[pin.id];
        driversByPin[pin.id] = this.drivers.length;
        this.netDrivers[net].push(this.drivers.length);
        this.drivers.push({
          net,
          node: index,
          pinId: pin.id,
          width: pin.width,
          // Everything starts high-impedance: a node has not driven a net
          // until it has actually run, which is what `reset` is for.
          value: createSignal(pin.width, Z),
        });
      }

      this.nodes.push({
        index,
        netlistNode,
        evaluate: definition?.evaluate,
        delayNs: Math.max(
          0,
          Math.trunc(
            definition?.delayNs?.(netlistNode.params) ?? DEFAULT_DELAY_NS,
          ),
        ),
        createState: definition?.createState,
        state: {},
        params: netlistNode.params,
        driversByPin,
        pinWidths,
      });
    }

    this.reset();
  }

  /** Simulated time, in nanoseconds. */
  get now(): number {
    return this.currentTime;
  }

  /**
   * Bumped once per advance that changed anything, never per event — the
   * `useSyncExternalStore` snapshot that lets React subscribe per net.
   */
  get version(): number {
    return this.currentVersion;
  }

  /** Compile-time netlist diagnostics plus anything the run has found. */
  get diagnostics(): Diagnostic[] {
    return [...this.netlist.diagnostics, ...this.runtimeDiagnostics];
  }

  /**
   * Recorded history for one node channel, oldest first — empty for a node
   * that has never emitted, which today is everything but `scope.logic`.
   */
  waveform(nodeId: string, channel: string): WaveformSample[] {
    return this.recorder.read(nodeId, channel);
  }

  readNet(netId: number): Signal {
    return Uint8Array.from(this.netValues[netId]);
  }

  readPin(nodeId: string, pinId: string): Signal {
    const net = this.netlist.pinToNet[pinKey(nodeId, pinId)];
    return net === undefined ? createSignal(1, X) : this.readNet(net);
  }

  /**
   * Back to `t = 0` with every net high-impedance and every node evaluated
   * once. Flip-flops come up `X` rather than `0`, the same as real hardware.
   */
  reset(): void {
    this.queue.clear();
    this.currentTime = 0;
    this.runtimeDiagnostics = [];
    this.recorder.clear();

    for (const [netId, net] of this.netlist.nets.entries()) {
      this.netValues[netId] = createSignal(net.width, Z);
    }
    for (const driver of this.drivers) {
      driver.value = createSignal(driver.width, Z);
    }
    // State is re-created through `createState` rather than reused: a reset
    // has to forget a latched value, not carry it across.
    for (const node of this.nodes) {
      node.state = node.createState?.(node.params) ?? {};
      this.queue.scheduleEval(node.index, 0);
    }

    this.currentVersion++;
    this.runUntil(0);
  }

  /**
   * Asks a node to re-evaluate although none of its inputs moved. The editor
   * calls this when a param changes — flipping a switch is not an event the
   * engine can see for itself.
   */
  scheduleNode(nodeId: string, delayNs = 0): void {
    const node = this.nodeById(nodeId);
    if (node) {
      this.queue.scheduleEval(
        node.index,
        this.currentTime + Math.max(0, Math.trunc(delayNs)),
      );
    }
  }

  /**
   * New params for one node, effective now.
   *
   * This is how a switch gets flipped mid-run. It deliberately does not
   * rebuild: an engine rebuild resets every net and forgets every latched
   * value, so flipping one switch would wipe the circuit's state. Params that
   * change the *pin layout* or the node's `delayNs` are a different matter:
   * both are read when the engine is built, so the caller rebuilds for those.
   */
  setNodeParams(nodeId: string, params: NodeParams): void {
    const node = this.nodeById(nodeId);
    if (!node) return;
    node.params = params;
    this.queue.scheduleEval(node.index, this.currentTime);
  }

  private nodeById(nodeId: string): NodeRuntime | undefined {
    return this.nodes.find((node) => node.netlistNode.id === nodeId);
  }

  /** Advances to the next event time, however far away it is. */
  step(): AdvanceResult {
    const next = this.queue.peek();
    if (!next) return { events: 0, settled: true, oscillating: false };
    return this.runUntil(next.time);
  }

  /**
   * Advances until `netId` has gone through a rising edge on bit 0, or until
   * `limitNs` of simulated time has passed with no edge.
   *
   * This is `stepCycle` from the spec, with the clock named explicitly rather
   * than through a "primary clock" setting — a document may have several, and
   * the caller always knows which one it means.
   */
  runToRisingEdge(netId: number, limitNs: number): AdvanceResult {
    const deadline = this.currentTime + limitNs;
    let events = 0;
    let previous = this.netValues[netId][0];

    while (this.currentTime < deadline) {
      const next = this.queue.peek();
      if (!next || next.time > deadline) break;

      const result = this.runUntil(next.time);
      events += result.events;
      if (result.oscillating)
        return { events, settled: false, oscillating: true };

      const current = this.netValues[netId][0];
      if (previous !== 1 && current === 1) {
        return { events, settled: this.queue.size === 0, oscillating: false };
      }
      previous = current;
    }

    return { events, settled: this.queue.size === 0, oscillating: false };
  }

  /**
   * Runs every event at or before `timeNs`, then stops.
   *
   * `maxEvents` is the caller's own budget — the runner passes its per-frame
   * cap. Reaching it is not a failure: simulated time stops where it got to,
   * `settled` comes back false, and the caller resumes next frame having
   * simply covered less ground than it asked for.
   *
   * The one thing that *is* a failure is a circuit churning at a single
   * timestamp, which is reported as `oscillation` and never throws — a
   * combinational loop is a diagnostic about the user's circuit, not an error
   * in ours.
   */
  runUntil(timeNs: number, maxEvents = MAX_EVENTS_PER_ADVANCE): AdvanceResult {
    const limit = Math.max(1, Math.trunc(maxEvents));
    let events = 0;
    let changed = false;
    let instant = this.currentTime;
    let eventsAtInstant = 0;
    this.churn.fill(0);

    for (;;) {
      const next = this.queue.peek();
      if (!next || next.time > timeNs) {
        this.currentTime = Math.max(this.currentTime, timeNs);
        if (changed) this.currentVersion++;
        return { events, settled: true, oscillating: false };
      }

      if (events >= limit) {
        if (changed) this.currentVersion++;
        return { events, settled: false, oscillating: false };
      }

      const event = this.queue.pop() as NonNullable<typeof next>;
      this.currentTime = event.time;
      events++;

      if (event.time === instant) {
        eventsAtInstant++;
        if (eventsAtInstant > MAX_EVENTS_PER_INSTANT) {
          this.reportOscillation();
          this.currentVersion++;
          return { events, settled: false, oscillating: true };
        }
      } else {
        instant = event.time;
        eventsAtInstant = 1;
      }

      if (event.kind === "eval") {
        this.evaluateNode(this.nodes[event.node]);
      } else if (this.applyWrite(event.driver, event.value)) {
        changed = true;
      }
    }
  }

  /** Applies a driver's new value and propagates if the net moved. */
  private applyWrite(driverIndex: number, value: Signal): boolean {
    const driver = this.drivers[driverIndex];
    driver.value = value;

    const net = driver.net;
    const resolved = resolveDrivers(
      this.netDrivers[net].map((index) => this.drivers[index].value),
      this.netValues[net].length,
    );
    // Idempotent writes are the normal case — a gate re-evaluates whenever any
    // input moves — so dropping no-op changes here is what stops a stable
    // circuit from generating events forever.
    if (signalsEqual(resolved, this.netValues[net])) return false;

    this.netValues[net] = resolved;
    this.churn[net]++;

    for (const reader of this.netReaders[net]) {
      if (reader.node < 0) continue;
      const node = this.nodes[reader.node];
      if (!node.evaluate) continue;
      this.queue.scheduleEval(node.index, this.currentTime + node.delayNs);
    }
    return true;
  }

  private evaluateNode(node: NodeRuntime): void {
    if (!node.evaluate) return;

    const now = this.currentTime;
    const context: EvalContext = {
      now,
      params: node.params,
      state: node.state,
      read: (pinId) => {
        const net = node.netlistNode.pinNets[pinId];
        const width = node.pinWidths[pinId] ?? 1;
        // A pin the definition declares always has a net, so `undefined` here
        // means the definition changed under a stale netlist; X is the honest
        // answer, and the netlist has already raised the diagnostic.
        return net === undefined
          ? createSignal(width, X)
          : fitSignal(this.netValues[net], width);
      },
      write: (pinId, value, delayNs = 0) => {
        const driverIndex = node.driversByPin[pinId];
        if (driverIndex === undefined) return;
        this.queue.scheduleWrite(
          driverIndex,
          fitSignal(value, this.drivers[driverIndex].width),
          now + Math.max(0, Math.trunc(delayNs)),
        );
      },
      scheduleSelf: (delayNs) => {
        this.queue.scheduleEval(
          node.index,
          now + Math.max(0, Math.trunc(delayNs)),
        );
      },
      emitSample: (channel, value) => {
        this.recorder.record(node.netlistNode.id, channel, now, value);
      },
    };

    node.evaluate(context);
  }

  /**
   * Names the nets that changed most during the failed advance and pins them
   * to `X`. Naming them matters: "your circuit oscillates" is useless advice,
   * "these three nets oscillate" points at the missing delay.
   */
  private reportOscillation(): void {
    const ranked = [...this.churn.entries()]
      .filter(([, count]) => count > 0)
      // Descending by churn, then by net id, so the report is deterministic
      // even when two nets toggled the same number of times.
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 5)
      .map(([netId]) => netId);

    for (const netId of ranked) {
      this.netValues[netId] = createSignal(this.netValues[netId].length, X);
    }

    this.queue.clear();
    this.runtimeDiagnostics.push({
      code: "oscillation",
      severity: "error",
      message: `Nets ${ranked.join(", ")} changed more than ${MAX_EVENTS_PER_INSTANT} times at t = ${this.currentTime} ns without simulated time advancing. They are oscillating and have been forced to X — break the combinational loop, or give a node in it a propagation delay.`,
      netId: ranked[0],
      nodeIds: this.nodesOnNets(ranked),
    });
  }

  private nodesOnNets(netIds: readonly number[]): string[] {
    const ids = new Set<string>();
    for (const netId of netIds) {
      for (const pin of this.netlist.nets[netId].drivers) ids.add(pin.nodeId);
    }
    return [...ids].sort();
  }
}
