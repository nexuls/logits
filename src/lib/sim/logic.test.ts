import { describe, expect, it } from "vitest";
import {
  AND2,
  apply2,
  combine,
  createSignal,
  fitSignal,
  formatSignal,
  fromBits,
  HIGH,
  isKnown,
  LOW,
  type LogicValue,
  not1,
  OR2,
  parseSignal,
  RESOLVE,
  resolveDrivers,
  signalsEqual,
  toBits,
  X,
  XOR2,
  Z,
} from "./logic";

/** The four values in table order, so a grid literal reads like the doc. */
const VALUES: LogicValue[] = [LOW, HIGH, X, Z];

/** Renders a table as the doc writes it: rows are A, columns are B. */
function grid(op: typeof AND2): string[] {
  return VALUES.map((a) =>
    VALUES.map((b) => formatSignal(Uint8Array.of(apply2(op, a, b)))).join(""),
  );
}

describe("the resolution table", () => {
  it("matches artifacts/04-simulation-engine.md exactly", () => {
    expect(grid(RESOLVE)).toEqual([
      //B: 0 1 X Z
      "0XX0", // A = 0
      "X1X1", // A = 1
      "XXXX", // A = X
      "01XZ", // A = Z
    ]);
  });

  it("is symmetric, so driver order cannot change a net's value", () => {
    for (const a of VALUES) {
      for (const b of VALUES) {
        expect(apply2(RESOLVE, a, b)).toBe(apply2(RESOLVE, b, a));
      }
    }
  });

  it("lets Z yield to any real driver", () => {
    expect(apply2(RESOLVE, Z, LOW)).toBe(LOW);
    expect(apply2(RESOLVE, Z, HIGH)).toBe(HIGH);
    expect(apply2(RESOLVE, Z, Z)).toBe(Z);
  });

  it("makes two opposed drivers X", () => {
    expect(apply2(RESOLVE, LOW, HIGH)).toBe(X);
  });
});

describe("gate tables", () => {
  it("honours AND's controlling value", () => {
    // A single 0 wins even against X and Z — without this, one unconnected
    // input turns half a circuit unknown and the app feels broken.
    expect(grid(AND2)).toEqual(["0000", "01XX", "0XXX", "0XXX"]);
  });

  it("honours OR's controlling value", () => {
    expect(grid(OR2)).toEqual(["01XX", "1111", "X1XX", "X1XX"]);
  });

  it("gives XOR no controlling value", () => {
    expect(grid(XOR2)).toEqual(["01XX", "10XX", "XXXX", "XXXX"]);
  });

  it("inverts Z to X, never to 1", () => {
    expect(not1(LOW)).toBe(HIGH);
    expect(not1(HIGH)).toBe(LOW);
    expect(not1(X)).toBe(X);
    expect(not1(Z)).toBe(X);
  });
});

describe("combine", () => {
  it("folds n inputs bit-lane by bit-lane", () => {
    const result = combine(
      [parseSignal("1010"), parseSignal("1100"), parseSignal("1111")],
      4,
      AND2,
    );
    expect(formatSignal(result)).toBe("1000");
  });

  it("inverts for the NAND/NOR family", () => {
    const result = combine(
      [parseSignal("10"), parseSignal("11")],
      2,
      AND2,
      true,
    );
    expect(formatSignal(result)).toBe("01");
  });

  it("normalises a lone Z input to X, with or without a fold", () => {
    expect(formatSignal(combine([parseSignal("Z")], 1, AND2))).toBe("X");
    expect(formatSignal(combine([parseSignal("Z")], 1, AND2, true))).toBe("X");
  });

  it("keeps unrelated bit lanes independent", () => {
    // Only 0 is AND's controlling value, so the Z lane goes X while the 0
    // lane stays 0 — each lane resolves on its own.
    const result = combine([parseSignal("0X1Z"), parseSignal("1111")], 4, AND2);
    expect(formatSignal(result)).toBe("0X1X");
  });
});

describe("resolveDrivers", () => {
  it("leaves a net with no drivers high-impedance", () => {
    expect(formatSignal(resolveDrivers([], 3))).toBe("ZZZ");
  });

  it("passes a single driver through", () => {
    expect(formatSignal(resolveDrivers([parseSignal("10X")], 3))).toBe("10X");
  });

  it("lets one active driver win over idle tri-states", () => {
    const value = resolveDrivers(
      [parseSignal("ZZZZ"), parseSignal("0110"), parseSignal("ZZZZ")],
      4,
    );
    expect(formatSignal(value)).toBe("0110");
  });

  it("makes a contested bit X and leaves its neighbours alone", () => {
    const value = resolveDrivers([parseSignal("0011"), parseSignal("0101")], 4);
    expect(formatSignal(value)).toBe("0XX1");
  });

  it("treats bits past a narrow driver's end as Z", () => {
    expect(formatSignal(resolveDrivers([parseSignal("11")], 4))).toBe("ZZ11");
  });
});

describe("number conversion", () => {
  it("round-trips through toBits and fromBits", () => {
    for (const value of [0, 1, 2, 5, 255, 1024]) {
      expect(fromBits(toBits(value, 16))).toBe(value);
    }
  });

  it("writes LSB first", () => {
    expect(formatSignal(toBits(5, 4))).toBe("0101");
  });

  it("stays exact past 32 bits, where a shift would wrap", () => {
    const wide = toBits(2 ** 33, 40);
    expect(wide[33]).toBe(HIGH);
    expect(wide[0]).toBe(LOW);
  });

  it("has no numeric value for X or Z", () => {
    expect(fromBits(parseSignal("1X"))).toBeNull();
    expect(fromBits(parseSignal("1Z"))).toBeNull();
    expect(isKnown(parseSignal("10"))).toBe(true);
    expect(isKnown(parseSignal("1Z"))).toBe(false);
  });
});

describe("fitSignal", () => {
  it("pads a short value with Z rather than guessing", () => {
    expect(formatSignal(fitSignal(parseSignal("11"), 4))).toBe("ZZ11");
  });

  it("truncates a long value to the pin", () => {
    expect(formatSignal(fitSignal(parseSignal("1111"), 2))).toBe("11");
  });

  it("copies, so a node cannot alias the engine's buffer", () => {
    const source = parseSignal("10");
    const fitted = fitSignal(source, 2);
    fitted[0] = X;
    expect(formatSignal(source)).toBe("10");
  });
});

describe("signal helpers", () => {
  it("round-trips through formatSignal and parseSignal", () => {
    expect(formatSignal(parseSignal("01XZ"))).toBe("01XZ");
  });

  it("rejects a character that is not a logic value", () => {
    expect(() => parseSignal("012")).toThrow();
  });

  it("compares by width as well as by bits", () => {
    expect(signalsEqual(parseSignal("01"), parseSignal("01"))).toBe(true);
    expect(signalsEqual(parseSignal("01"), parseSignal("001"))).toBe(false);
  });

  it("fills a new signal with Z by default", () => {
    expect(formatSignal(createSignal(3))).toBe("ZZZ");
  });
});
