import { describe, expect, it } from "vitest";
import { lookupNode } from "@/lib/nodes/registry";
import { engineFor, evaluateOnce } from "@/test/circuit";
import { keypadKeys, NO_KEY } from "./keypad";

describe("io.keypad", () => {
  it("reads a numeric label as its own value, and a word as its position", () => {
    expect(keypadKeys({ keys: "7,8,9" }).map((key) => key.value)).toEqual([
      7, 8, 9,
    ]);
    expect(keypadKeys({ keys: "RUN, STOP, STEP" })).toEqual([
      { label: "RUN", value: 0 },
      { label: "STOP", value: 1 },
      { label: "STEP", value: 2 },
    ]);
    expect(keypadKeys({ keys: "0x0a" })[0].value).toBe(10);
  });

  it("falls back to 0-9 for a keys param that lists nothing", () => {
    expect(keypadKeys({ keys: " , ," })).toHaveLength(10);
    expect(keypadKeys({})).toHaveLength(10);
  });

  it("drives the held key's value and raises the strobe", () => {
    const writes = evaluateOnce("io.keypad", {}, { pressed: 7, width: 4 });

    expect(writes.out.value).toBe("0111");
    expect(writes.valid.value).toBe("1");
  });

  it("holds the last value on release when latched, and drops it when not", () => {
    const latched = evaluateOnce(
      "io.keypad",
      {},
      { pressed: NO_KEY, value: 9, width: 4, latch: true },
    );
    const momentary = evaluateOnce(
      "io.keypad",
      {},
      { pressed: NO_KEY, value: 9, width: 4, latch: false },
    );

    expect(latched.out.value).toBe("1001");
    expect(latched.valid.value).toBe("0");
    expect(momentary.out.value).toBe("0000");
  });

  it("ignores a pressed index that is not a key", () => {
    const writes = evaluateOnce("io.keypad", {}, { pressed: 99, width: 4 });

    expect(writes.valid.value).toBe("0");
  });

  it("grows its grid — and its body — with the key list", () => {
    const definition = lookupNode("io.keypad");
    if (!definition) throw new Error("io.keypad is missing");

    const phone = definition.size({ keys: "0,1,2,3,4,5,6,7,8,9", columns: 3 });
    const row = definition.size({ keys: "0,1,2,3,4,5,6,7,8,9", columns: 10 });

    expect(phone.height).toBeGreaterThan(row.height);
    expect(row.width).toBeGreaterThan(phone.width);
  });
});

describe("io.kickstart", () => {
  it("pulses once at the start of the run and then stays idle", () => {
    const { at, run } = engineFor({
      kick: { type: "io.kickstart", params: { widthNs: 50 } },
    });

    run(10);
    expect(at("kick", "out")).toBe("1");

    run(50);
    expect(at("kick", "out")).toBe("0");

    // The whole point: it never fires again, however long the circuit runs.
    run(10_000);
    expect(at("kick", "out")).toBe("0");
  });

  it("waits out its start delay before firing", () => {
    const { at, run } = engineFor({
      kick: {
        type: "io.kickstart",
        params: { widthNs: 20, startDelayNs: 100 },
      },
    });

    run(10);
    expect(at("kick", "out")).toBe("0");

    run(100);
    expect(at("kick", "out")).toBe("1");

    run(30);
    expect(at("kick", "out")).toBe("0");
  });

  it("idles high and pulses low when it is active low", () => {
    const { at, run } = engineFor({
      kick: {
        type: "io.kickstart",
        params: { widthNs: 50, active: "low" },
      },
    });

    run(10);
    expect(at("kick", "out")).toBe("0");

    run(50);
    expect(at("kick", "out")).toBe("1");
  });

  it("fires again after a reset, and only then", () => {
    const { engine, at, run } = engineFor({
      kick: { type: "io.kickstart", params: { widthNs: 50 } },
    });

    run(1_000);
    expect(at("kick", "out")).toBe("0");

    engine.reset();
    run(10);
    expect(at("kick", "out")).toBe("1");
  });

  it("clears a counter out of X before its first clock edge", () => {
    const { at, run } = engineFor(
      {
        kick: { type: "io.kickstart", params: { widthNs: 20 } },
        clk: { type: "time.clock", params: { periodNs: 100 } },
        count: { type: "seq.counter", params: { width: 4 } },
      },
      [
        ["kick", "out", "count", "rst"],
        ["clk", "out", "count", "clk"],
      ],
    );

    run(30);
    expect(at("count", "q")).toBe("0000");
  });
});
