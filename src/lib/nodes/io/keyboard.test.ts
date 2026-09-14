import { describe, expect, it } from "vitest";
import type { NodeParams } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { engineFor } from "@/test/circuit";
import { encodeKey, isExitChord, type KeyEvent } from "./keyboard-codes";

const key = (
  seq: number,
  code: string,
  value: string,
  extra: Partial<KeyEvent> = {},
): KeyEvent => ({ seq, code, key: value, ...extra });

const byte = (value: number) => value.toString(2).padStart(8, "0");

const chord = {
  code: "Escape",
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
};

describe("keyboard encodings", () => {
  it("sends the character typed as ASCII, with terminal control codes", () => {
    const ascii = (event: KeyEvent) =>
      encodeKey("ascii", event, false).map((code) => code.byte);

    expect(ascii(key(1, "KeyA", "a"))).toEqual([0x61]);
    expect(ascii(key(1, "KeyA", "A"))).toEqual([0x41]);
    expect(ascii(key(1, "Enter", "Enter"))).toEqual([0x0d]);
    expect(ascii(key(1, "KeyC", "c", { ctrl: true }))).toEqual([0x03]);
    expect(ascii(key(1, "ArrowUp", "ArrowUp"))).toEqual([]);
    expect(ascii(key(1, "KeyE", "é"))).toEqual([]);
  });

  it("sends the physical key's usage ID as HID, flagging releases", () => {
    expect(encodeKey("hid", key(1, "KeyA", "q"), false)).toEqual([
      { byte: 0x04, brk: false },
    ]);
    expect(encodeKey("hid", key(1, "KeyA", "a", { up: true }), true)).toEqual([
      { byte: 0x04, brk: true },
    ]);
    expect(encodeKey("hid", key(1, "KeyA", "a", { up: true }), false)).toEqual(
      [],
    );
  });

  it("sends PS/2 Set 2 bytes, with E0 and F0 prefixes in band", () => {
    const ps2 = (event: KeyEvent) =>
      encodeKey("ps2", event, true).map((code) => code.byte);

    expect(ps2(key(1, "KeyA", "a"))).toEqual([0x1c]);
    expect(ps2(key(1, "KeyA", "a", { up: true }))).toEqual([0xf0, 0x1c]);
    expect(ps2(key(1, "ArrowUp", "ArrowUp"))).toEqual([0xe0, 0x75]);
    expect(ps2(key(1, "ArrowUp", "ArrowUp", { up: true }))).toEqual([
      0xe0, 0xf0, 0x75,
    ]);
  });

  it("matches only the configured exit chord", () => {
    expect(isExitChord("escape", chord)).toBe(true);
    expect(isExitChord("escape", { ...chord, shiftKey: true })).toBe(false);
    expect(isExitChord("shift-escape", chord)).toBe(false);
    expect(isExitChord("shift-escape", { ...chord, shiftKey: true })).toBe(
      true,
    );
    expect(
      isExitChord("ctrl-bracket", {
        ...chord,
        code: "BracketRight",
        ctrlKey: true,
      }),
    ).toBe(true);
  });
});

describe("io.keyboard", () => {
  it("has RD only for the handshake, and BRK only when releases are out of band", () => {
    const definition = lookupNode("io.keyboard");
    if (!definition) throw new Error("io.keyboard is missing");
    const ids = (params: NodeParams) =>
      definition
        .pins({ ...definition.defaultParams, ...params })
        .map((pin) => pin.id)
        .sort();

    expect(ids({})).toEqual(["clr", "data", "ovf", "rd", "valid"]);
    expect(ids({ protocol: "strobe" })).not.toContain("rd");
    expect(ids({ releases: true })).toContain("brk");
    expect(ids({ releases: true, encoding: "ps2" })).not.toContain("brk");
  });

  it("buffers keys and hands them over one RD edge at a time", () => {
    const { at, run, set } = engineFor(
      {
        kbd: { type: "io.keyboard" },
        rd: { type: "io.button" },
      },
      [["rd", "out", "kbd", "rd"]],
    );

    run(5);
    expect(at("kbd", "valid")).toBe("0");

    const typed = [key(1, "KeyH", "h"), key(2, "KeyI", "i")];
    set("kbd", { events: typed });
    run(5);
    expect(at("kbd", "valid")).toBe("1");
    expect(at("kbd", "data")).toBe(byte(0x68));

    set("rd", { pressed: true });
    run(5);
    expect(at("kbd", "data")).toBe(byte(0x69));

    set("rd", { pressed: false });
    run(5);
    // Only a rising edge reads: letting go of RD leaves the byte in place.
    expect(at("kbd", "data")).toBe(byte(0x69));

    set("rd", { pressed: true });
    run(5);
    expect(at("kbd", "valid")).toBe("0");
    expect(at("kbd", "data")).toBe(byte(0));
  });

  it("drops a key into a full buffer, latches OVF, and CLR empties it", () => {
    const { at, run, set } = engineFor(
      {
        kbd: { type: "io.keyboard", params: { depth: 1 } },
        clr: { type: "io.button" },
      },
      [["clr", "out", "kbd", "clr"]],
    );

    set("kbd", {
      depth: 1,
      events: [key(1, "KeyA", "a"), key(2, "KeyB", "b")],
    });
    run(5);
    expect(at("kbd", "data")).toBe(byte(0x61));
    expect(at("kbd", "ovf")).toBe("1");

    set("clr", { pressed: true });
    run(5);
    expect(at("kbd", "valid")).toBe("0");
    expect(at("kbd", "ovf")).toBe("0");
  });

  it("never retypes a logged key after a reset", () => {
    const { engine, at, run, set } = engineFor({
      kbd: { type: "io.keyboard" },
    });

    set("kbd", { events: [key(1, "KeyA", "a")] });
    run(5);
    expect(at("kbd", "valid")).toBe("1");

    engine.reset();
    run(5);
    expect(at("kbd", "valid")).toBe("0");
  });

  it("strobes each byte for its pulse width, then a gap, then the next", () => {
    const { at, run, set } = engineFor({
      kbd: { type: "io.keyboard", params: { protocol: "strobe" } },
    });

    run(5);
    set("kbd", {
      protocol: "strobe",
      pulseNs: 10,
      events: [key(1, "KeyA", "a"), key(2, "KeyB", "b")],
    });
    run(2);
    expect(at("kbd", "valid")).toBe("1");
    expect(at("kbd", "data")).toBe(byte(0x61));

    run(10);
    expect(at("kbd", "valid")).toBe("0");
    expect(at("kbd", "data")).toBe(byte(0x61));

    run(10);
    expect(at("kbd", "valid")).toBe("1");
    expect(at("kbd", "data")).toBe(byte(0x62));

    run(30);
    expect(at("kbd", "valid")).toBe("0");
    expect(at("kbd", "data")).toBe(byte(0x62));
  });

  it("reports releases on BRK for HID", () => {
    const { at, run, set } = engineFor({
      kbd: { type: "io.keyboard", params: { encoding: "hid", releases: true } },
    });

    set("kbd", {
      encoding: "hid",
      releases: true,
      events: [key(1, "KeyA", "a"), key(2, "KeyA", "a", { up: true })],
    });
    run(5);
    expect(at("kbd", "data")).toBe(byte(0x04));
    expect(at("kbd", "brk")).toBe("0");
  });
});
