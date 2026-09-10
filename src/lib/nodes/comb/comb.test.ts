import { describe, expect, it } from "vitest";
import { evaluateOnce, outputOf } from "@/test/circuit";
import { SEGMENT_PATTERNS } from "../instruments/sevenseg";
import { ALU_OPS } from "./alu";

/**
 * Combinational blocks are truth tables, so they are exercised directly
 * through `evaluate` — but with the `X` and `Z` rows a two-valued table has no
 * way to write down, which is where these nodes actually differ from each
 * other.
 */

describe("comb.mux", () => {
  it("passes the selected input through", () => {
    expect(outputOf("comb.mux", { sel: "0", in0: "1", in1: "0" })).toBe("1");
    expect(outputOf("comb.mux", { sel: "1", in0: "1", in1: "0" })).toBe("0");
  });

  it("selects with more than one select bit", () => {
    const params = { selectBits: 2, width: 1 };
    const inputs = { in0: "0", in1: "1", in2: "0", in3: "1" };

    expect(outputOf("comb.mux", { ...inputs, sel: "10" }, "out", params)).toBe(
      "0",
    );
    expect(outputOf("comb.mux", { ...inputs, sel: "11" }, "out", params)).toBe(
      "1",
    );
  });

  it("is X when the select line cannot be resolved", () => {
    expect(outputOf("comb.mux", { sel: "X", in0: "1", in1: "1" })).toBe("X");
    // Even when both inputs agree: the mux does not get to guess.
    expect(outputOf("comb.mux", { in0: "1", in1: "1" })).toBe("X");
  });

  it("works at any width", () => {
    expect(
      outputOf("comb.mux", { sel: "1", in0: "0000", in1: "1010" }, "out", {
        width: 4,
      }),
    ).toBe("1010");
  });
});

describe("comb.demux", () => {
  it("routes the input and drives the rest low", () => {
    const writes = evaluateOnce("comb.demux", { sel: "1", in: "1" });

    expect(writes.out0.value).toBe("0");
    expect(writes.out1.value).toBe("1");
  });

  it("is X everywhere when `sel` is unknown", () => {
    const writes = evaluateOnce("comb.demux", { sel: "X", in: "1" });

    expect(writes.out0.value).toBe("X");
    expect(writes.out1.value).toBe("X");
  });
});

describe("comb.decoder", () => {
  it("raises exactly one output", () => {
    const writes = evaluateOnce("comb.decoder", { in: "10" });

    expect(
      [0, 1, 2, 3].map((index) => writes[`out${index}`].value).join(""),
    ).toBe("0010");
  });

  it("is enabled when nothing drives `en`, and cleared when it is held low", () => {
    expect(evaluateOnce("comb.decoder", { in: "00" }).out0.value).toBe("1");
    expect(evaluateOnce("comb.decoder", { in: "00", en: "0" }).out0.value).toBe(
      "0",
    );
    expect(evaluateOnce("comb.decoder", { in: "00", en: "X" }).out0.value).toBe(
      "X",
    );
  });
});

describe("comb.encoder", () => {
  it("reports the index of the high input, with `valid`", () => {
    const writes = evaluateOnce("comb.encoder", {
      in0: "0",
      in1: "0",
      in2: "1",
      in3: "0",
    });

    expect(writes.out.value).toBe("10");
    expect(writes.valid.value).toBe("1");
  });

  it("clears `valid` when nothing is asserted", () => {
    const writes = evaluateOnce("comb.encoder", {
      in0: "0",
      in1: "0",
      in2: "0",
      in3: "0",
    });

    expect(writes.out.value).toBe("00");
    expect(writes.valid.value).toBe("0");
  });

  it("takes the highest index in priority mode and ignores what is below it", () => {
    const writes = evaluateOnce("comb.encoder", {
      in0: "1",
      in1: "X",
      in2: "0",
      in3: "1",
    });

    // in3 wins outright, so the unresolved in1 beneath it does not matter.
    expect(writes.out.value).toBe("11");
  });

  it("is X in priority mode when an unresolved input outranks every high one", () => {
    const writes = evaluateOnce("comb.encoder", {
      in0: "1",
      in1: "0",
      in2: "0",
      in3: "X",
    });

    expect(writes.out.value).toBe("XX");
    expect(writes.valid.value).toBe("X");
  });

  it("refuses to guess in plain mode when two inputs are high", () => {
    const writes = evaluateOnce(
      "comb.encoder",
      { in0: "1", in1: "1", in2: "0", in3: "0" },
      { priority: false },
    );

    expect(writes.out.value).toBe("XX");
  });
});

describe("comb.adder", () => {
  it("adds, with the carry in and out", () => {
    expect(
      outputOf("comb.adder", { a: "0011", b: "0101" }, "sum", { width: 4 }),
    ).toBe("1000");

    const carried = evaluateOnce(
      "comb.adder",
      { a: "1111", b: "0001" },
      { width: 4 },
    );
    expect(carried.sum.value).toBe("0000");
    expect(carried.cout.value).toBe("1");
  });

  it("treats an unwired carry-in as no carry", () => {
    expect(
      outputOf("comb.adder", { a: "0001", b: "0001" }, "sum", { width: 4 }),
    ).toBe("0010");
    expect(
      outputOf("comb.adder", { a: "0001", b: "0001", cin: "1" }, "sum", {
        width: 4,
      }),
    ).toBe("0011");
  });

  it("keeps the lanes a controlling value settles, and only those", () => {
    // Bit 0: 0 + 0 is 0 and carries 0 whatever bit 1 does, so the unknown
    // does not smear downwards.
    const writes = evaluateOnce(
      "comb.adder",
      { a: "X0", b: "00" },
      { width: 2 },
    );

    expect(writes.sum.value).toBe("X0");
  });
});

describe("comb.comparator", () => {
  it("compares unsigned", () => {
    const writes = evaluateOnce(
      "comb.comparator",
      { a: "0011", b: "0101" },
      { width: 4 },
    );

    expect(writes.lt.value).toBe("1");
    expect(writes.eq.value).toBe("0");
    expect(writes.gt.value).toBe("0");
  });

  it("compares signed as two's complement", () => {
    const inputs = { a: "1111", b: "0001" };

    expect(
      evaluateOnce("comb.comparator", inputs, { width: 4, signed: false }).gt
        .value,
    ).toBe("1");
    // -1 is less than 1.
    expect(
      evaluateOnce("comb.comparator", inputs, { width: 4, signed: true }).lt
        .value,
    ).toBe("1");
  });

  it("is X on all three outputs when either operand is unknown", () => {
    const writes = evaluateOnce(
      "comb.comparator",
      { a: "00X1", b: "0101" },
      { width: 4 },
    );

    expect([writes.lt.value, writes.eq.value, writes.gt.value]).toEqual([
      "X",
      "X",
      "X",
    ]);
  });
});

describe("comb.alu", () => {
  const run = (op: (typeof ALU_OPS)[number], a: string, b: string) =>
    evaluateOnce("comb.alu", { a, b, op: opBits(op) }, { width: 4 });

  const opBits = (op: (typeof ALU_OPS)[number]) =>
    ALU_OPS.indexOf(op).toString(2).padStart(3, "0");

  it("computes each op in the frozen table", () => {
    expect(run("add", "0011", "0001").out.value).toBe("0100");
    expect(run("sub", "0011", "0001").out.value).toBe("0010");
    expect(run("and", "1100", "1010").out.value).toBe("1000");
    expect(run("or", "1100", "1010").out.value).toBe("1110");
    expect(run("xor", "1100", "1010").out.value).toBe("0110");
    expect(run("not", "1100", "0000").out.value).toBe("0011");
    expect(run("shl", "0011", "0000").out.value).toBe("0110");
    expect(run("shr", "0110", "0000").out.value).toBe("0011");
  });

  it("raises `zero` only when the result is all zeros", () => {
    expect(run("sub", "0011", "0011").zero.value).toBe("1");
    expect(run("sub", "0011", "0001").zero.value).toBe("0");
  });

  it("reports signed overflow on arithmetic", () => {
    // 7 + 1 wraps to -8 in four bits: the operands agreed on sign and the
    // result does not.
    expect(run("add", "0111", "0001").overflow.value).toBe("1");
    expect(run("add", "0001", "0001").overflow.value).toBe("0");
  });

  it("is entirely X when the op code cannot be resolved", () => {
    const writes = evaluateOnce(
      "comb.alu",
      { a: "0011", b: "0001", op: "0X1" },
      { width: 4 },
    );

    expect(writes.out.value).toBe("XXXX");
    expect(writes.zero.value).toBe("X");
    expect(writes.carry.value).toBe("X");
  });
});

describe("comb.segdriver", () => {
  const segments = (writes: ReturnType<typeof evaluateOnce>, digit: number) =>
    ["a", "b", "c", "d", "e", "f", "g"]
      .map((segment) => writes[`d${digit}${segment}`].value)
      .join("");

  it("decodes a digit to the same pattern the display would", () => {
    const writes = evaluateOnce("comb.segdriver", { value: "0011" });

    // 3, and the display's own BCD mode agrees because both read the one table.
    expect(segments(writes, 0)).toBe(SEGMENT_PATTERNS[3]);
  });

  it("splits a value across digits by radix", () => {
    const hex = evaluateOnce(
      "comb.segdriver",
      { value: "10100011" },
      { width: 8, digits: 2, radix: "hex" },
    );
    const dec = evaluateOnce(
      "comb.segdriver",
      { value: "00101101" },
      { width: 8, digits: 2, radix: "dec" },
    );

    // 0xA3: digit 0 is the low nibble.
    expect(segments(hex, 0)).toBe(SEGMENT_PATTERNS[3]);
    expect(segments(hex, 1)).toBe(SEGMENT_PATTERNS[0xa]);
    // 45 in decimal, not 0x2d.
    expect(segments(dec, 0)).toBe(SEGMENT_PATTERNS[5]);
    expect(segments(dec, 1)).toBe(SEGMENT_PATTERNS[4]);
  });

  it("blanks leading zeros but never the last digit", () => {
    const params = { width: 8, digits: 2, radix: "dec", blankLeading: true };
    const seven = evaluateOnce("comb.segdriver", { value: "00000111" }, params);
    const zero = evaluateOnce("comb.segdriver", { value: "00000000" }, params);

    expect(segments(seven, 1)).toBe("0000000");
    expect(segments(seven, 0)).toBe(SEGMENT_PATTERNS[7]);
    // A value of zero still reads "0" rather than going dark altogether.
    expect(segments(zero, 0)).toBe(SEGMENT_PATTERNS[0]);
    expect(segments(zero, 1)).toBe("0000000");
  });

  it("keeps a leading zero when blanking is off", () => {
    const writes = evaluateOnce(
      "comb.segdriver",
      { value: "00000111" },
      { width: 8, digits: 2, radix: "dec", blankLeading: false },
    );

    expect(segments(writes, 1)).toBe(SEGMENT_PATTERNS[0]);
  });

  it("inverts every segment for a common-anode display", () => {
    const writes = evaluateOnce(
      "comb.segdriver",
      { value: "0011" },
      { commonAnode: true },
    );

    expect(segments(writes, 0)).toBe(
      SEGMENT_PATTERNS[3]
        .split("")
        .map((bit) => (bit === "1" ? "0" : "1"))
        .join(""),
    );
  });

  it("blanks and lamp-tests, with blanking winning", () => {
    const blanked = evaluateOnce("comb.segdriver", { value: "1000", bl: "1" });
    const tested = evaluateOnce("comb.segdriver", { value: "1000", lt: "1" });
    const both = evaluateOnce("comb.segdriver", {
      value: "1000",
      bl: "1",
      lt: "1",
    });

    expect(segments(blanked, 0)).toBe("0000000");
    expect(segments(tested, 0)).toBe("1111111");
    expect(segments(both, 0)).toBe("0000000");
  });

  it("is X on every segment when the value or a control is unresolved", () => {
    expect(segments(evaluateOnce("comb.segdriver", { value: "10X1" }), 0)).toBe(
      "XXXXXXX",
    );
    // An unwired value is floating, which is no more decodable than X.
    expect(segments(evaluateOnce("comb.segdriver", {}), 0)).toBe("XXXXXXX");
    expect(
      segments(evaluateOnce("comb.segdriver", { value: "0001", bl: "X" }), 0),
    ).toBe("XXXXXXX");
  });

  it("runs an unwired driver, which is idle rather than blanked", () => {
    // BL and LT unwired read Z, and Z on a control is idle (ADR 0009).
    const writes = evaluateOnce("comb.segdriver", { value: "0001" });
    expect(segments(writes, 0)).toBe(SEGMENT_PATTERNS[1]);
  });
});
