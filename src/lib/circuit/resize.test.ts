import { describe, expect, it } from "vitest";
import { lookupNode } from "@/lib/nodes/registry";
import { addNode, setNodeFrame } from "./commands";
import { resizeBox, type SizeLimits } from "./geometry";
import { createEmptyDocument } from "./io";

const LIMITS: SizeLimits = {
  min: { width: 2, height: 2 },
  max: { width: 400, height: 400 },
};

/** 10 × 5 cells at the origin. */
const BOX = { x: 0, y: 0, width: 100, height: 50 };

describe("resizeBox", () => {
  it("grows from a corner, snapping the moving edges to the grid", () => {
    expect(resizeBox(BOX, { x: 1, y: 1 }, { x: 23, y: 7 }, LIMITS)).toEqual({
      position: { x: 0, y: 0 },
      size: { width: 12, height: 6 },
    });
  });

  it("keeps the opposite edge fixed when a left handle is dragged", () => {
    expect(resizeBox(BOX, { x: -1, y: 0 }, { x: -31, y: 0 }, LIMITS)).toEqual({
      position: { x: -30, y: 0 },
      size: { width: 13, height: 5 },
    });
  });

  it("leaves the other axis alone for a handle mid-edge", () => {
    const { size } = resizeBox(BOX, { x: 0, y: 1 }, { x: 90, y: 20 }, LIMITS);
    expect(size).toEqual({ width: 10, height: 7 });
  });

  it("stops at the minimum against the fixed edge instead of flipping", () => {
    expect(
      resizeBox(BOX, { x: -1, y: -1 }, { x: 200, y: 200 }, LIMITS),
    ).toEqual({
      position: { x: 80, y: 30 },
      size: { width: 2, height: 2 },
    });
  });

  it("clamps at the maximum", () => {
    const limits = { ...LIMITS, max: { width: 12, height: 400 } };
    const { size } = resizeBox(BOX, { x: 1, y: 0 }, { x: 500, y: 0 }, limits);
    expect(size.width).toBe(12);
  });

  it("follows the pointer off the grid when snapping is off", () => {
    const { size } = resizeBox(
      BOX,
      { x: 1, y: 0 },
      { x: 14, y: 0 },
      LIMITS,
      false,
    );
    expect(size.width).toBe(11);
  });
});

describe("setNodeFrame", () => {
  const text = lookupNode("deco.text");
  if (!text) throw new Error("deco.text is missing from the registry");

  const placed = addNode(createEmptyDocument("Frame"), text, {
    position: { x: 0, y: 0 },
  });

  it("moves a node and patches its params in one change", () => {
    const next = setNodeFrame(
      placed.document,
      placed.nodeId,
      { x: -20, y: 10 },
      { width: 30, height: 4 },
    );
    const node = next.nodes[placed.nodeId];

    expect(node.position).toEqual({ x: -20, y: 10 });
    expect(node.params.width).toBe(30);
    expect(node.params.height).toBe(4);
    expect(node.params.text).toBe(text.defaultParams.text);
  });

  it("returns the same document when nothing changes", () => {
    const { width, height } = text.defaultParams;
    expect(
      setNodeFrame(
        placed.document,
        placed.nodeId,
        { x: 0, y: 0 },
        { width, height },
      ),
    ).toBe(placed.document);
  });

  it("ignores a node that does not exist", () => {
    expect(
      setNodeFrame(placed.document, "missing", { x: 1, y: 1 }, { width: 3 }),
    ).toBe(placed.document);
  });
});
