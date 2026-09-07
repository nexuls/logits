import { describe, expect, it } from "vitest";
import { EventQueue, type SimEvent } from "./queue";

const drain = (queue: EventQueue): SimEvent[] => {
  const out: SimEvent[] = [];
  for (let event = queue.pop(); event; event = queue.pop()) out.push(event);
  return out;
};

const times = (events: readonly SimEvent[]) => events.map((e) => e.time);

const nodes = (events: readonly SimEvent[]) =>
  events.map((e) => (e.kind === "eval" ? e.node : -1));

describe("ordering", () => {
  it("pops in time order however events were pushed", () => {
    const queue = new EventQueue();
    for (const time of [50, 10, 90, 30, 70, 20]) queue.scheduleEval(0, time);

    expect(times(drain(queue))).toEqual([10, 20, 30, 50, 70, 90]);
  });

  it("breaks a tie by sequence, not by node id", () => {
    const queue = new EventQueue();
    // Pushed high id first: ordering by id would reverse these.
    queue.scheduleEval(9, 5);
    queue.scheduleEval(3, 5);
    queue.scheduleEval(7, 5);

    expect(nodes(drain(queue))).toEqual([9, 3, 7]);
  });

  it("keeps a later insertion at an earlier time in front", () => {
    const queue = new EventQueue();
    queue.scheduleEval(0, 100);
    queue.scheduleEval(1, 1);

    expect(times(drain(queue))).toEqual([1, 100]);
  });

  it("survives a heap-sized run without losing order", () => {
    const queue = new EventQueue();
    // A deterministic pseudo-shuffle: enough events to exercise sink-down
    // through several levels, with no reliance on Math.random.
    for (let i = 0; i < 500; i++) queue.scheduleEval(i, (i * 137) % 500);

    const popped = times(drain(queue));
    expect(popped).toHaveLength(500);
    expect(popped).toEqual([...popped].sort((a, b) => a - b));
  });
});

describe("coalescing", () => {
  it("drops a second eval of one node at one instant", () => {
    const queue = new EventQueue();

    expect(queue.scheduleEval(4, 10)).toBe(true);
    expect(queue.scheduleEval(4, 10)).toBe(false);
    expect(queue.size).toBe(1);
  });

  it("keeps evals of one node at different times", () => {
    const queue = new EventQueue();
    queue.scheduleEval(4, 10);
    queue.scheduleEval(4, 11);

    expect(times(drain(queue))).toEqual([10, 11]);
  });

  it("keeps evals of different nodes at one instant", () => {
    const queue = new EventQueue();
    queue.scheduleEval(1, 10);
    queue.scheduleEval(2, 10);

    expect(queue.size).toBe(2);
  });

  it("lets the same node be re-scheduled once its event has popped", () => {
    const queue = new EventQueue();
    queue.scheduleEval(4, 10);
    queue.pop();

    expect(queue.scheduleEval(4, 10)).toBe(true);
  });

  it("does not coalesce writes — a node contradicting itself keeps both", () => {
    const queue = new EventQueue();
    queue.scheduleWrite(0, Uint8Array.of(1), 5);
    queue.scheduleWrite(0, Uint8Array.of(0), 5);

    const popped = drain(queue);
    expect(popped).toHaveLength(2);
    expect(popped.map((e) => (e.kind === "write" ? e.value[0] : -1))).toEqual([
      1, 0,
    ]);
  });
});

describe("clear", () => {
  it("empties the heap and forgets what was pending", () => {
    const queue = new EventQueue();
    queue.scheduleEval(1, 10);
    queue.clear();

    expect(queue.size).toBe(0);
    expect(queue.peek()).toBeUndefined();
    expect(queue.scheduleEval(1, 10)).toBe(true);
  });

  it("keeps counting sequence numbers across a reset", () => {
    const queue = new EventQueue();
    queue.scheduleEval(1, 10);
    const before = queue.sequence;
    queue.clear();

    expect(queue.sequence).toBe(before);
  });
});
