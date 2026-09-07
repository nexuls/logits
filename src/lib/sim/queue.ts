/**
 * The event queue: a binary min-heap ordered by `(time, sequence)`.
 *
 * The monotonic sequence number is what makes the simulation deterministic.
 * Two events at the same nanosecond are extremely common — a fan-out writes
 * several nets at once — and ordering them by anything derived from object
 * iteration, ids or `Map` insertion would make the same circuit produce
 * different waveforms on different runs.
 * See artifacts/decisions/0001-event-driven-simulation.md.
 */

/** A driver's write landing on its net. */
export type WriteEvent = {
  kind: "write";
  /** Index into the engine's flat driver table. */
  driver: number;
  value: Uint8Array;
};

/** A node reacting to one of its inputs having changed. */
export type EvalEvent = {
  kind: "eval";
  /** Index into the netlist's node array. */
  node: number;
};

export type SimEvent = (WriteEvent | EvalEvent) & {
  /** Integer nanoseconds. Never a float — see artifacts/04-simulation-engine.md. */
  time: number;
  sequence: number;
};

export class EventQueue {
  private heap: SimEvent[] = [];
  private nextSequence = 0;
  /**
   * `"node@time"` for every eval currently in the heap. Scheduling a node
   * twice at one instant is the normal case — a gate whose two inputs change
   * together — and queueing both would evaluate it twice for no reason.
   */
  private pendingEvals = new Set<string>();

  get size(): number {
    return this.heap.length;
  }

  /** The sequence the next pushed event will take. Exposed for tests. */
  get sequence(): number {
    return this.nextSequence;
  }

  clear(): void {
    this.heap = [];
    this.pendingEvals.clear();
    // Sequence deliberately keeps counting: a reset re-seeds the queue and
    // restarting the count would let a stale comparison tie.
  }

  peek(): SimEvent | undefined {
    return this.heap[0];
  }

  /** Returns false when an identical eval is already pending at that time. */
  scheduleEval(node: number, time: number): boolean {
    const key = `${node}@${time}`;
    if (this.pendingEvals.has(key)) return false;
    this.pendingEvals.add(key);
    this.push({ kind: "eval", node, time, sequence: this.nextSequence++ });
    return true;
  }

  /**
   * Writes are not coalesced. Two writes to one driver at one instant are a
   * node contradicting itself, and the last one in wins — which is what the
   * same code would do outside the engine.
   */
  scheduleWrite(driver: number, value: Uint8Array, time: number): void {
    this.push({
      kind: "write",
      driver,
      value,
      time,
      sequence: this.nextSequence++,
    });
  }

  pop(): SimEvent | undefined {
    const top = this.heap[0];
    if (top === undefined) return undefined;

    const last = this.heap.pop() as SimEvent;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    if (top.kind === "eval") {
      this.pendingEvals.delete(`${top.node}@${top.time}`);
    }
    return top;
  }

  private push(event: SimEvent): void {
    this.heap.push(event);
    this.bubbleUp(this.heap.length - 1);
  }

  private bubbleUp(start: number): void {
    let index = start;
    const event = this.heap[index];
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!precedes(event, this.heap[parent])) break;
      this.heap[index] = this.heap[parent];
      index = parent;
    }
    this.heap[index] = event;
  }

  private sinkDown(start: number): void {
    let index = start;
    const event = this.heap[index];
    const half = this.heap.length >> 1;
    while (index < half) {
      let child = index * 2 + 1;
      const right = child + 1;
      if (
        right < this.heap.length &&
        precedes(this.heap[right], this.heap[child])
      ) {
        child = right;
      }
      if (!precedes(this.heap[child], event)) break;
      this.heap[index] = this.heap[child];
      index = child;
    }
    this.heap[index] = event;
  }
}

function precedes(a: SimEvent, b: SimEvent): boolean {
  return a.time !== b.time ? a.time < b.time : a.sequence < b.sequence;
}
