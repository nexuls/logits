import { describe, expect, it } from "vitest";
import type { PinSpec } from "@/lib/circuit/schema";
import {
  bodyGutters,
  fitBody,
  fitTitle,
  labelChars,
  titleSpace,
} from "./label-metrics";

const pin = (
  id: string,
  side: PinSpec["side"],
  offset = 2,
  name = id.toUpperCase(),
): PinSpec => ({ id, name, direction: "in", width: 1, side, offset });

describe("labelChars", () => {
  it("counts glyphs, not code points", () => {
    // `Q̅` is a `Q` and a combining macron: two code points, one glyph. Taking
    // the string at its word gives a flip-flop twice the gutter it needs.
    expect(labelChars("Q̅")).toBe(1);
    expect(labelChars("COUT")).toBe(4);
  });
});

describe("bodyGutters", () => {
  it("sizes each edge to the names actually on it", () => {
    const gutters = bodyGutters(
      [pin("d", "left"), pin("cout", "right"), pin("clk", "bottom")],
      true,
    );

    expect(gutters.right).toBeGreaterThan(gutters.left);
    expect(gutters.top).toBeLessThan(gutters.left);
  });

  it("gives back the whole body when the names are not drawn", () => {
    const bare = bodyGutters([pin("cout", "right")], false);
    const labelled = bodyGutters([pin("cout", "right")], true);

    expect(bare.right).toBeLessThan(labelled.right);
  });
});

describe("fitTitle", () => {
  it("sets the name down a body that is clearly taller than it is wide", () => {
    expect(fitTitle("ENC", { across: 30, down: 160 }).axis).toBe("vertical");
  });

  it("keeps it upright when the two axes are close", () => {
    // Upright text is read faster, so a hair more height does not turn it.
    expect(fitTitle("ENC", { across: 40, down: 44 }).axis).toBe("horizontal");
  });

  it("steps the type down before it wraps", () => {
    const roomy = fitTitle("Register", { across: 90, down: 40 });
    const tight = fitTitle("Register", { across: 44, down: 14 });

    expect(roomy.fontSize).toBe(10);
    expect(roomy.lines).toBe(1);
    expect(tight.fontSize).toBeLessThan(10);
    expect(tight.lines).toBe(1);
  });

  it("never asks for more lines than the room can stack", () => {
    const layout = fitTitle("Demultiplexer", { across: 20, down: 12 });

    expect(layout.lines).toBe(1);
    expect(layout.lines * layout.lineHeight).toBeLessThanOrEqual(12);
  });
});

describe("fitBody", () => {
  const pins = [pin("in", "left", 2), pin("out", "right", 2, "Y")];

  it("leaves a body that can already hold its name alone", () => {
    const size = { width: 10, height: 6 };
    const fitted = fitBody("MUX", pins, size, true);

    expect(fitted.size).toEqual(size);
    expect(fitted.pins).toBe(pins);
  });

  it("widens one that cannot", () => {
    const fitted = fitBody(
      "Demultiplexer",
      pins,
      { width: 6, height: 6 },
      true,
    );

    expect(fitted.size.width).toBeGreaterThan(6);
    expect(fitted.size.height).toBe(6);
  });

  it("grows in whole cells, so every pin stays on the grid", () => {
    const clocked = [
      pin("d", "left", 2),
      pin("clk", "bottom", 4),
      pin("rst", "top", 4),
    ];
    const fitted = fitBody(
      "Comparator",
      clocked,
      { width: 4, height: 6 },
      true,
    );

    for (const spec of fitted.pins) {
      expect(Number.isInteger(spec.offset)).toBe(true);
    }
  });

  it("keeps a centred pin centred in the wider body", () => {
    const clocked = [pin("clk", "bottom", 3)];
    const size = { width: 6, height: 6 };
    const fitted = fitBody("Demultiplexer", clocked, size, true);

    const grew = fitted.size.width - size.width;
    expect(grew).toBeGreaterThan(0);
    expect(fitted.pins[0].offset).toBe(3 + grew / 2);
    // Still the middle of the edge it sits on.
    expect(fitted.pins[0].offset * 2).toBe(fitted.size.width);
  });

  it("raises a body squeezed flat between a top and a bottom label", () => {
    // `RST`/`SET`/`EN` above and `CLK` below can leave a six-cell body with
    // less clear height than one line of text, and no width fixes that.
    const squeezed = [
      pin("rst", "top", 2),
      pin("set", "top", 4),
      pin("clk", "bottom", 3),
    ];
    const fitted = fitBody("REG", squeezed, { width: 12, height: 4 }, true);

    expect(fitted.size.height).toBeGreaterThan(4);
  });

  it("always ends up somewhere the name fits on one line", () => {
    const size = { width: 4, height: 4 };
    const fitted = fitBody("Comparator", pins, size, true);
    const bounds = {
      width: fitted.size.width * 10,
      height: fitted.size.height * 10,
    };
    const layout = fitTitle(
      "Comparator",
      titleSpace(bounds, bodyGutters(fitted.pins, true)),
    );

    expect(layout.lines).toBe(1);
    expect(layout.fontSize).toBeGreaterThanOrEqual(8);
  });
});
