import { describe, expect, it } from "vitest";
import { lookupNode } from "@/lib/nodes/registry";
import { engineFor, evaluateOnce } from "@/test/circuit";
import {
  addressBits,
  cellsOnLine,
  paintPixels,
  pixelRows,
  storedPixels,
} from "./drawpad";

describe("io.drawpad", () => {
  it("shows exactly the resolution, padding and cropping what is stored", () => {
    expect(
      pixelRows({ columns: 4, rows: 3, pixels: ["1", "111111", 7] }),
    ).toEqual(["1000", "1111", "0000"]);
  });

  it("reads anything that is not a 1 as a dark pixel", () => {
    expect(storedPixels({ pixels: ["1X0a1"] })).toEqual(["10001"]);
    expect(storedPixels({ pixels: "nope" })).toEqual([]);
  });

  it("keeps pixels outside a shrunk resolution, and changes nothing twice", () => {
    const drawn = paintPixels([], [{ row: 5, column: 6 }], true);
    expect(drawn[5]).toBe("0000001");

    // A 4 × 4 pad cannot show (5, 6), but painting on it must not erase it.
    const small = paintPixels(drawn, [{ row: 0, column: 0 }], true);
    expect(small[5]).toBe("0000001");
    expect(pixelRows({ columns: 8, rows: 8, pixels: [...small] })[5]).toBe(
      "00000010",
    );

    expect(paintPixels(small, [{ row: 0, column: 0 }], true)).toBe(small);
  });

  it("fills in every cell a quick stroke crossed", () => {
    const cells = cellsOnLine({ row: 0, column: 0 }, { row: 2, column: 5 });

    expect(cells[0]).toEqual({ row: 0, column: 0 });
    expect(cells.at(-1)).toEqual({ row: 2, column: 5 });
    expect(cells).toHaveLength(6);
    for (let index = 1; index < cells.length; index++) {
      expect(
        Math.abs(cells[index].row - cells[index - 1].row),
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(cells[index].column - cells[index - 1].column),
      ).toBeLessThanOrEqual(1);
    }
    expect(cellsOnLine({ row: 3, column: 3 }, { row: 3, column: 3 })).toEqual([
      { row: 3, column: 3 },
    ]);
  });

  it("drives one bus per row, leftmost pixel as the MSB", () => {
    const writes = evaluateOnce(
      "io.drawpad",
      {},
      { columns: 4, rows: 2, pixels: ["1001", "0110"] },
    );

    expect(writes.row0.value).toBe("1001");
    expect(writes.row1.value).toBe("0110");
  });

  it("reads one pixel and its row by address", () => {
    const params = {
      columns: 5,
      rows: 3,
      output: "addressed",
      pixels: ["00000", "01001"],
    };

    const hit = evaluateOnce("io.drawpad", { x: "001", y: "01" }, params);
    expect(hit.row.value).toBe("01001");
    expect(hit.px.value).toBe("1");

    const miss = evaluateOnce("io.drawpad", { x: "010", y: "01" }, params);
    expect(miss.px.value).toBe("0");

    // Past the right edge and past the bottom: nothing is there, so zero.
    const outside = evaluateOnce("io.drawpad", { x: "111", y: "11" }, params);
    expect(outside.row.value).toBe("00000");
    expect(outside.px.value).toBe("0");
  });

  it("drives X for an address it cannot resolve", () => {
    const params = { columns: 4, rows: 4, output: "addressed" };

    const unwired = evaluateOnce("io.drawpad", {}, params);
    expect(unwired.row.value).toBe("XXXX");
    expect(unwired.px.value).toBe("X");

    const noColumn = evaluateOnce(
      "io.drawpad",
      { y: "00" },
      { ...params, pixels: ["1111"] },
    );
    expect(noColumn.row.value).toBe("1111");
    expect(noColumn.px.value).toBe("X");
  });

  it("sizes its address pins to reach every pixel", () => {
    expect(addressBits(2)).toBe(1);
    expect(addressBits(5)).toBe(3);
    expect(addressBits(32)).toBe(5);

    const definition = lookupNode("io.drawpad");
    if (!definition) throw new Error("io.drawpad is missing");
    const pins = definition.pins({ columns: 16, rows: 5, output: "addressed" });

    expect(pins.find((pin) => pin.id === "x")?.width).toBe(4);
    expect(pins.find((pin) => pin.id === "y")?.width).toBe(3);
    expect(pins.find((pin) => pin.id === "row")?.width).toBe(16);
  });

  it("reaches a matrix display, and redraws it mid-run", () => {
    const { at, run, set } = engineFor(
      {
        pad: { type: "io.drawpad", params: { columns: 8, rows: 8 } },
        panel: { type: "disp.matrix", params: { size: 8 } },
      },
      [["pad", "row0", "panel", "row0"]],
    );

    run(10);
    expect(at("panel", "row0")).toBe("00000000");

    set("pad", { pixels: ["11000011"] });
    run(10);
    expect(at("panel", "row0")).toBe("11000011");
  });
});
