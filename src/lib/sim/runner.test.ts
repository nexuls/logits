import { beforeEach, describe, expect, it } from "vitest";
import { buildNetlist } from "@/lib/circuit/netlist";
import type { CircuitDocument } from "@/lib/circuit/schema";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "./engine";
import { type FrameScheduler, Runner } from "./runner";

/**
 * The runner is the one part of the engine that touches real time, so these
 * tests inject frames rather than waiting for them — which is exactly why
 * `FrameScheduler` is a parameter and not a direct `requestAnimationFrame`.
 */
class FakeFrames implements FrameScheduler {
  private pending = new Map<number, (timeMs: number) => void>();
  private nextHandle = 1;
  cancelled = 0;

  request = (callback: (timeMs: number) => void): number => {
    const handle = this.nextHandle++;
    this.pending.set(handle, callback);
    return handle;
  };

  cancel = (handle: number): void => {
    if (this.pending.delete(handle)) this.cancelled++;
  };

  get waiting(): number {
    return this.pending.size;
  }

  /** Fires every callback queued right now, at `timeMs`. */
  tick(timeMs: number): void {
    const due = [...this.pending.entries()];
    this.pending.clear();
    for (const [, callback] of due) callback(timeMs);
  }
}

/** A ring that has been started, so it makes an event every nanosecond. */
function runningRing(): CircuitDocument {
  const node = (
    id: string,
    type: string,
    params: Record<string, unknown> = {},
  ) => [
    id,
    {
      id,
      type,
      position: { x: 0, y: 0 },
      params: { ...lookupNode(type)?.defaultParams, ...params },
    },
  ];
  const wire = (id: string, a: string, ap: string, b: string, bp: string) => [
    id,
    { id, from: { nodeId: a, pinId: ap }, to: { nodeId: b, pinId: bp } },
  ];

  return {
    version: 1,
    id: "d_runner",
    name: "Ring",
    nodes: Object.fromEntries([
      node("nand", "gate.nand"),
      node("i1", "gate.not"),
      node("i2", "gate.not"),
      node("en", "io.switch", { value: 0 }),
    ]) as CircuitDocument["nodes"],
    wires: Object.fromEntries([
      wire("w0", "en", "out", "nand", "in0"),
      wire("w1", "i2", "out", "nand", "in1"),
      wire("w2", "nand", "out", "i1", "in"),
      wire("w3", "i1", "out", "i2", "in"),
    ]) as CircuitDocument["wires"],
  };
}

let frames: FakeFrames;
let engine: Engine;
let runner: Runner;

beforeEach(() => {
  frames = new FakeFrames();
  engine = new Engine(buildNetlist(runningRing(), lookupNode), lookupNode);
  engine.runUntil(100);
  engine.setNodeParams("en", { width: 1, value: 1 });
  runner = new Runner(engine, {
    frames,
    // A 16 ms frame is 1600 ns of simulated time: a few thousand ring events,
    // comfortably inside the default per-frame budget.
    speedNsPerSecond: 100_000,
  });
});

describe("modes", () => {
  it("starts paused and requests no frames", () => {
    expect(runner.mode).toBe("paused");
    expect(frames.waiting).toBe(0);
  });

  it("requests a frame when played and cancels it when paused", () => {
    runner.play();
    expect(runner.mode).toBe("running");
    expect(frames.waiting).toBe(1);

    runner.pause();
    expect(runner.mode).toBe("paused");
    expect(frames.cancelled).toBe(1);
    expect(frames.waiting).toBe(0);
  });

  it("ignores a second play rather than queueing two frame loops", () => {
    runner.play();
    runner.play();
    expect(frames.waiting).toBe(1);
  });

  it("keeps requesting frames while it runs", () => {
    runner.play();
    frames.tick(0);
    expect(frames.waiting).toBe(1);
    frames.tick(16);
    expect(frames.waiting).toBe(1);
  });
});

describe("simulated time", () => {
  it("advances in proportion to real elapsed time", () => {
    runner.play();
    // The first frame has no previous timestamp to measure from, so it
    // establishes the baseline rather than simulating a jump.
    frames.tick(1000);
    const start = engine.now;

    frames.tick(1016);
    expect(engine.now - start).toBe(1_600);
  });

  it("does not simulate the gap while it was paused", () => {
    runner.play();
    frames.tick(0);
    frames.tick(16);
    runner.pause();

    const paused = engine.now;
    runner.play();
    frames.tick(60_000);

    expect(engine.now).toBe(paused);
  });

  it("clamps a very long frame instead of simulating the whole gap", () => {
    runner.play();
    frames.tick(0);
    const start = engine.now;

    // A backgrounded tab, not a slow machine: simulating ten seconds here
    // would hang, so the frame is capped.
    frames.tick(10_000);
    expect(engine.now - start).toBeLessThanOrEqual(100_000);
  });

  it("advances nothing at zero speed", () => {
    runner.setSpeed(0);
    runner.play();
    frames.tick(0);
    const start = engine.now;
    frames.tick(16);

    expect(engine.now).toBe(start);
  });

  it("reports the rate it actually achieved", () => {
    runner.play();
    frames.tick(0);
    frames.tick(16);

    expect(runner.achievedNsPerSecond).toBeCloseTo(100_000, -3);
  });
});

describe("notifications", () => {
  it("notifies once per frame, not once per event", () => {
    let notifications = 0;
    runner.subscribe(() => notifications++);

    runner.play();
    notifications = 0;
    frames.tick(0);
    frames.tick(16);

    // Thousands of events happened in that second frame.
    expect(notifications).toBe(2);
  });

  it("hands React the engine's version as its snapshot", () => {
    const before = runner.getSnapshot();
    runner.play();
    frames.tick(0);
    frames.tick(16);

    expect(runner.getSnapshot()).toBeGreaterThan(before);
    expect(runner.getSnapshot()).toBe(engine.version);
  });

  it("stops notifying once unsubscribed", () => {
    let notifications = 0;
    const unsubscribe = runner.subscribe(() => notifications++);
    unsubscribe();

    runner.play();
    frames.tick(0);
    expect(notifications).toBe(0);
  });
});

describe("manual control", () => {
  it("pauses when stepping, so a running clock cannot race the user", () => {
    runner.play();
    runner.step();

    expect(runner.mode).toBe("paused");
    expect(frames.waiting).toBe(0);
  });

  it("advances a fixed span of simulated time", () => {
    const start = engine.now;
    runner.advance(50);

    expect(engine.now).toBe(start + 50);
  });

  it("returns to time zero on reset, paused", () => {
    runner.play();
    frames.tick(0);
    frames.tick(16);
    runner.reset();

    expect(engine.now).toBe(0);
    expect(runner.mode).toBe("paused");
  });
});

describe("outrunning the machine", () => {
  it("falls behind rather than freezing, and reports the rate it managed", () => {
    // Far more simulated time per frame than the event budget can cover.
    runner.setSpeed(1e12);
    runner.play();
    frames.tick(0);
    frames.tick(16);

    // Still running — a busy circuit is slow, not broken.
    expect(runner.mode).toBe("running");
    expect(runner.achievedNsPerSecond).toBeGreaterThan(0);
    expect(runner.achievedNsPerSecond).toBeLessThan(1e12);
    expect(engine.diagnostics.map((d) => d.code)).not.toContain("oscillation");
  });

  it("keeps making progress across frames when it is behind", () => {
    runner.setSpeed(1e12);
    runner.play();
    frames.tick(0);
    frames.tick(16);
    const after = engine.now;
    frames.tick(32);

    expect(engine.now).toBeGreaterThan(after);
  });
});

describe("dispose", () => {
  it("cancels the frame and drops every listener", () => {
    let notifications = 0;
    runner.subscribe(() => notifications++);
    runner.play();
    runner.dispose();
    notifications = 0;

    frames.tick(16);
    expect(notifications).toBe(0);
    expect(frames.waiting).toBe(0);
  });
});
