import { describe, expect, it } from "vitest";
import { engineFor, evaluateOnce } from "@/test/circuit";
import { parseContents } from "./contents";

describe("parseContents", () => {
  it("reads hex words, lowest address first, and zero-fills the rest", () => {
    expect(parseContents("01 ff 0x0a", 5, 8)).toEqual([1, 255, 10, 0, 0]);
  });

  it("survives a hand-edited image without throwing", () => {
    expect(parseContents("", 2, 4)).toEqual([0, 0]);
    expect(parseContents("zz, 3", 2, 4)).toEqual([0, 3]);
    // Words wider than the memory wrap rather than corrupting the cell.
    expect(parseContents("ff", 1, 4)).toEqual([15]);
  });
});

describe("mem.rom", () => {
  const params = { addressBits: 2, width: 4, contents: "1 2 4 8" };

  it("reads the addressed word", () => {
    expect(evaluateOnce("mem.rom", { addr: "00" }, params).data.value).toBe(
      "0001",
    );
    expect(evaluateOnce("mem.rom", { addr: "11" }, params).data.value).toBe(
      "1000",
    );
  });

  it("lets go of the bus when `en` is held low, and drives when unwired", () => {
    expect(
      evaluateOnce("mem.rom", { addr: "01", en: "0" }, params).data.value,
    ).toBe("ZZZZ");
    expect(evaluateOnce("mem.rom", { addr: "01" }, params).data.value).toBe(
      "0010",
    );
  });

  it("is X on an address it cannot resolve", () => {
    expect(evaluateOnce("mem.rom", { addr: "0X" }, params).data.value).toBe(
      "XXXX",
    );
  });

  it("shares a bus with another tri-state driver without a short", () => {
    const { engine } = engineFor(
      {
        low: { type: "mem.rom", params: { ...params, addressBits: 2 } },
        high: { type: "mem.rom", params: { ...params, addressBits: 2 } },
        probe: { type: "io.probe", params: { width: 4 } },
      },
      [
        ["low", "data", "probe", "in"],
        ["high", "data", "probe", "in"],
      ],
    );

    expect(
      engine.diagnostics.filter(
        (diagnostic) => diagnostic.code === "multiple-drivers",
      ),
    ).toEqual([]);
  });
});

describe("mem.ram", () => {
  const params = { addressBits: 2, width: 4, contents: "3 0 0 0" };

  it("reads its initial image when `oe` is asserted", () => {
    expect(
      evaluateOnce("mem.ram", { addr: "00", oe: "1" }, params).data.value,
    ).toBe("0011");
  });

  it("stays off the bus unless `oe` says otherwise", () => {
    expect(evaluateOnce("mem.ram", { addr: "00" }, params).data.value).toBe(
      "ZZZZ",
    );
  });

  it("writes on the clock edge and reads the word back", () => {
    const state = { cells: [0, 0, 0, 0] as (number | null)[], clk: -1 };

    // A low clock first, so the next call is a genuine rising edge rather
    // than the first level this node has ever seen.
    evaluateOnce(
      "mem.ram",
      { addr: "01", we: "1", clk: "0", data: "1001" },
      params,
      { state },
    );
    evaluateOnce(
      "mem.ram",
      { addr: "01", we: "1", clk: "1", data: "1001" },
      params,
      { state },
    );

    expect(state.cells[1]).toBe(9);
    expect(
      evaluateOnce("mem.ram", { addr: "01", oe: "1" }, params, { state }).data
        .value,
    ).toBe("1001");
  });

  it("never drives the bus while it is being written to", () => {
    expect(
      evaluateOnce("mem.ram", { addr: "00", we: "1", oe: "1" }, params).data
        .value,
    ).toBe("ZZZZ");
  });

  it("writes without a clock when it is asynchronous", () => {
    const state = { cells: [0, 0, 0, 0] as (number | null)[], clk: -1 };

    evaluateOnce(
      "mem.ram",
      { addr: "10", we: "1", data: "0101" },
      { ...params, synchronous: false },
      { state },
    );

    expect(state.cells[2]).toBe(5);
  });
});
