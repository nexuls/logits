import { describe, expect, it } from "vitest";
import { addNode } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import { buildNetlist } from "@/lib/circuit/netlist";
import { lookupNode } from "../registry";
import { groupHeader, groupNode, groupStyle } from "./group";
import {
  textAlign,
  textContent,
  textFontSize,
  textFormat,
  textNode,
} from "./text";

describe("deco.group", () => {
  it("keeps one cell to grab an untitled group by", () => {
    const header = groupHeader({ title: "", subtitle: "  " });
    expect(header.height).toBe(0);
    expect(header.cells).toBe(1);
  });

  it("grows its header for a title, and again for a subtitle", () => {
    const title = groupHeader({ title: "Adder", fontSize: 14 });
    const both = groupHeader({
      title: "Adder",
      subtitle: "4-bit ripple carry",
      fontSize: 14,
    });

    expect(both.height).toBeGreaterThan(title.height);
    // The grab strip covers everything drawn in the header.
    expect(title.cells * 10).toBeGreaterThanOrEqual(title.height);
    expect(both.cells * 10).toBeGreaterThanOrEqual(both.height);
  });

  it("never claims a header taller than the group", () => {
    expect(
      groupHeader({ title: "A", subtitle: "B", fontSize: 48, height: 4 }).cells,
    ).toBe(4);
  });

  it("clamps a hand-edited header size, style and footprint", () => {
    expect(groupHeader({ title: "A", fontSize: 999 }).titleSize).toBe(48);
    expect(groupStyle({ style: "neon" })).toBe("filled");
    expect(groupNode.size({ width: 0, height: "tall" })).toEqual({
      width: 8,
      height: 24,
    });
  });

  it("carries its contents unless told not to", () => {
    const enclosure = groupNode.decoration?.enclosure;
    expect(enclosure?.carries({})).toBe(true);
    expect(enclosure?.carries({ carry: false })).toBe(false);
  });
});

describe("deco.text", () => {
  it("falls back to sensible values for a hand-edited file", () => {
    const params = { text: 42, format: "html", align: "justify", fontSize: 0 };
    expect(textContent(params)).toBe("");
    expect(textFormat(params)).toBe("markdown");
    expect(textAlign(params)).toBe("left");
    expect(textFontSize(params)).toBe(6);
  });

  it("keeps an explicit plain format and alignment", () => {
    expect(textFormat({ format: "plain" })).toBe("plain");
    expect(textAlign({ align: "right" })).toBe("right");
  });

  it("caps the stored text", () => {
    expect(textContent({ text: "x".repeat(20_000) })).toHaveLength(10_000);
  });
});

describe("decorations in a circuit", () => {
  it("compile to nothing — no nets and no diagnostics", () => {
    let document = createEmptyDocument("Notes");
    document = addNode(document, groupNode, {
      position: { x: 0, y: 0 },
    }).document;
    document = addNode(document, textNode, {
      position: { x: 20, y: 40 },
    }).document;

    const netlist = buildNetlist(document, lookupNode);
    expect(netlist.nets).toHaveLength(0);
    expect(netlist.diagnostics).toEqual([]);
  });
});
