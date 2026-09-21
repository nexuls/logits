import { describe, expect, it } from "vitest";
import { addNode, setNodeParams } from "@/lib/circuit/commands";
import {
  GRID_SIZE,
  nodeBounds,
  pinOffsets,
  rectsIntersect,
} from "@/lib/circuit/geometry";
import { createEmptyDocument } from "@/lib/circuit/io";
import { buildNetlist } from "@/lib/circuit/netlist";
import type { CircuitDocument } from "@/lib/circuit/schema";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { formatSignal } from "@/lib/sim/logic";
import { executeSteps, groupSteps, type IndexedStep } from "./execute";
import type { PlanStep } from "./protocol";

const indexed = (steps: PlanStep[]): IndexedStep[] =>
  steps.map((step, index) => ({ index, step }));

const context = {
  worldCenter: { x: 400, y: 300 },
  selection: [],
  placed: new Map<number, string[]>(),
};

function boundsOfNode(document: CircuitDocument, id: string) {
  const node = document.nodes[id];
  const definition = lookupNode(node.type);
  if (!definition) throw new Error(node.type);
  return nodeBounds(node.position, definition.size(node.params));
}

function pinWorldY(document: CircuitDocument, nodeId: string, pinId: string) {
  const node = document.nodes[nodeId];
  const definition = lookupNode(node.type);
  if (!definition) throw new Error(node.type);
  const offset = pinOffsets(
    definition.pins(node.params),
    definition.size(node.params),
  ).find((entry) => entry.spec.id === pinId);
  if (!offset) throw new Error(pinId);
  return node.position.y + offset.dy;
}

const MATRIX_AND_PAD: PlanStep[] = [
  { op: "place", type: "disp.matrix", count: 1, params: { size: 16 } },
  {
    op: "place",
    type: "io.drawpad",
    count: 1,
    params: { columns: 16, rows: 16 },
  },
  {
    op: "connect",
    from: { kind: "placed", step: 0 },
    to: { kind: "placed", step: 1 },
  },
];

describe("executeSteps", () => {
  it("places a matrix and a draw pad and wires every row", () => {
    const result = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed(MATRIX_AND_PAD),
      context,
    );

    const [matrix] = result.placed.get(0) ?? [];
    const [pad] = result.placed.get(1) ?? [];
    const wires = Object.values(result.document.wires);

    expect(result.document.nodes[matrix].params.size).toBe(16);
    expect(result.document.nodes[pad].params).toMatchObject({
      columns: 16,
      rows: 16,
    });
    expect(wires).toHaveLength(16);
    expect(
      wires.every((wire) => "nodeId" in wire.from && wire.from.nodeId === pad),
    ).toBe(true);
    expect(result.selection?.sort()).toEqual([matrix, pad].sort());
    expect(result.notes.at(-1)).toBe(
      "Wired the Draw pad to the Matrix display (16 connections).",
    );
  });

  it("lays out drivers to the left, level with what they drive, without overlap", () => {
    const { document, placed } = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed(MATRIX_AND_PAD),
      context,
    );
    const [matrix] = placed.get(0) ?? [];
    const [pad] = placed.get(1) ?? [];

    // Listed matrix-first; the pad drives it, so the pad is on the left.
    expect(document.nodes[pad].position.x).toBeLessThan(
      document.nodes[matrix].position.x,
    );
    expect(
      rectsIntersect(
        boundsOfNode(document, pad),
        boundsOfNode(document, matrix),
      ),
    ).toBe(false);
    expect(pinWorldY(document, pad, "row0")).toBe(
      pinWorldY(document, matrix, "row0"),
    );
  });

  it("puts new parts clear of what is already on the canvas", () => {
    const led = lookupNode("io.led");
    if (!led) throw new Error("io.led");
    const existing = addNode(createEmptyDocument(), led, {
      position: { x: 380, y: 280 },
    });

    const result = executeSteps(
      existing.document,
      lookupNode,
      indexed([{ op: "place", type: "comb.alu", count: 1, params: {} }]),
      context,
    );
    const [alu] = result.placed.get(0) ?? [];

    expect(
      rectsIntersect(
        boundsOfNode(result.document, alu),
        boundsOfNode(result.document, existing.nodeId),
      ),
    ).toBe(false);
  });

  it("holds settings to the limits the inspector enforces, and says so", () => {
    const result = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed([
        {
          op: "place",
          type: "disp.matrix",
          count: 1,
          params: { size: 64, bogus: 1 },
        },
      ]),
      context,
    );
    const [matrix] = result.placed.get(0) ?? [];

    expect(result.document.nodes[matrix].params.size).toBe(16);
    expect(result.document.nodes[matrix].params).not.toHaveProperty("bogus");
    expect(result.notes.join(" ")).toContain("out of range");
  });

  it("skips targets deleted since the request was sent", () => {
    const result = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed([{ op: "delete", target: { kind: "nodes", ids: ["n_gone"] } }]),
      context,
    );

    expect(result.problems).toEqual(["Found nothing to delete."]);
  });

  it("changes a setting only on elements of the type it belongs to", () => {
    const led = lookupNode("io.led");
    const counter = lookupNode("seq.counter");
    if (!led || !counter) throw new Error("fixtures");
    const a = addNode(createEmptyDocument(), led, { position: { x: 0, y: 0 } });
    const b = addNode(a.document, counter, {
      position: { x: 10 * GRID_SIZE, y: 0 },
    });

    const result = executeSteps(
      b.document,
      lookupNode,
      indexed([
        {
          op: "set",
          target: { kind: "all" },
          type: "seq.counter",
          params: { width: 8 },
        },
      ]),
      context,
    );

    expect(result.document.nodes[b.nodeId].params.width).toBe(8);
    expect(result.document.nodes[a.nodeId]).toBe(b.document.nodes[a.nodeId]);
  });

  it("chains elements left to right when told only to wire them together", () => {
    const toggle = lookupNode("io.switch");
    const led = lookupNode("io.led");
    if (!toggle || !led) throw new Error("fixtures");
    const a = addNode(createEmptyDocument(), led, {
      position: { x: 200, y: 0 },
    });
    const b = addNode(a.document, toggle, { position: { x: 0, y: 0 } });

    const result = executeSteps(
      b.document,
      lookupNode,
      indexed([{ op: "connect", from: { kind: "all" } }]),
      context,
    );

    expect(Object.values(result.document.wires)).toEqual([
      expect.objectContaining({
        from: { nodeId: b.nodeId, pinId: "out" },
        to: { nodeId: a.nodeId, pinId: "in" },
      }),
    ]);
  });
});

describe("executeSteps, through an element in between", () => {
  const TILE: PlanStep[] = [
    { op: "place", type: "disp.matrix", count: 4, params: { size: 16 } },
    {
      op: "place",
      type: "io.drawpad",
      count: 1,
      params: { columns: 32, rows: 32 },
    },
    {
      op: "connect",
      from: { kind: "placed", step: 0 },
      to: { kind: "placed", step: 1 },
      via: "bus.split",
    },
  ];

  it("splits every row of a 32 × 32 pad across four 16 × 16 matrices", () => {
    const result = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed(TILE),
      context,
    );
    expect(result.problems).toEqual([]);

    const matrices = result.placed.get(0) ?? [];
    const [pad] = result.placed.get(1) ?? [];
    const nodes = Object.values(result.document.nodes);
    const splits = nodes.filter((node) => node.type === "bus.split");
    const wires = Object.values(result.document.wires);

    expect(splits).toHaveLength(32);
    expect(splits.every((node) => node.params.groups === "16,16")).toBe(true);
    // A wire into each split, and one out of each of its two lanes.
    expect(wires).toHaveLength(32 * 3);
    expect(result.notes.at(-1)).toBe(
      "Wired the Draw pad to 4 × Matrix display through 32 × Split (96 connections).",
    );

    // Row 20 is in the bottom half; its left (most significant) 16 pixels go
    // to the bottom-left matrix, its right 16 to the bottom-right, both on
    // their row 4.
    const into = (nodeId: string, pinId: string) =>
      wires.find((w) => w.to.nodeId === nodeId && w.to.pinId === pinId);
    const split =
      into(splits[0].id, "in") &&
      wires.find(
        (w) =>
          "nodeId" in w.from &&
          w.from.nodeId === pad &&
          w.from.pinId === "row20",
      )?.to.nodeId;
    if (!split) throw new Error("row 20 is not split");
    const from = (lane: string) =>
      wires.find(
        (w) =>
          "nodeId" in w.from &&
          w.from.nodeId === split &&
          w.from.pinId === lane,
      )?.to;
    expect(from("out1")).toEqual({ nodeId: matrices[2], pinId: "row4" });
    expect(from("out0")).toEqual({ nodeId: matrices[3], pinId: "row4" });
  });

  it("shows the pad's picture across the four matrices when simulated", () => {
    const result = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed(TILE),
      context,
    );
    const matrices = result.placed.get(0) ?? [];
    const [pad] = result.placed.get(1) ?? [];

    // An irregular picture, so a swapped half or an off-by-one row shows.
    const picture = Array.from({ length: 32 }, (_, row) =>
      Array.from({ length: 32 }, (_, column) =>
        (row * 7 + column * 3) % 5 === 0 ? "1" : "0",
      ).join(""),
    );
    const drawn = setNodeParams(result.document, pad, { pixels: picture });
    const engine = new Engine(buildNetlist(drawn, lookupNode), lookupNode);
    engine.runUntil(1_000);

    // Top-left, top-right, bottom-left, bottom-right: each shows its quarter.
    matrices.forEach((matrix, panel) => {
      const top = Math.floor(panel / 2) * 16;
      const left = (panel % 2) * 16;
      for (let row = 0; row < 16; row++) {
        expect(formatSignal(engine.readPin(matrix, `row${row}`))).toBe(
          picture[top + row].slice(left, left + 16),
        );
      }
    });
  });

  it("lays the matrices out as the 2 × 2 picture they show", () => {
    const { document, placed } = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed(TILE),
      context,
    );
    const [topLeft, topRight, bottomLeft, bottomRight] = placed.get(0) ?? [];
    const at = (id: string) => document.nodes[id].position;

    expect(at(topLeft).y).toBe(at(topRight).y);
    expect(at(topLeft).x).toBeLessThan(at(topRight).x);
    expect(at(bottomLeft).x).toBe(at(topLeft).x);
    expect(at(bottomLeft).y).toBeGreaterThan(at(topLeft).y);
    expect(at(bottomRight).y).toBe(at(bottomLeft).y);
  });

  it("sits each split level with the row it cuts, without overlapping", () => {
    const { document } = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed(TILE),
      context,
    );
    const wires = Object.values(document.wires);
    const splits = Object.values(document.nodes).filter(
      (node) => node.type === "bus.split",
    );

    for (const split of splits) {
      const feed = wires.find((wire) => wire.to.nodeId === split.id);
      if (!feed || !("nodeId" in feed.from)) throw new Error("unfed split");
      expect(pinWorldY(document, split.id, "in")).toBe(
        pinWorldY(document, feed.from.nodeId, feed.from.pinId),
      );
    }
    for (const [k, a] of splits.entries()) {
      for (const b of splits.slice(k + 1)) {
        expect(
          rectsIntersect(
            boundsOfNode(document, a.id),
            boundsOfNode(document, b.id),
          ),
        ).toBe(false);
      }
    }
  });

  it("changes nothing when the two sides cannot tile, and says why", () => {
    const empty = createEmptyDocument();
    const result = executeSteps(
      empty,
      lookupNode,
      indexed([
        { op: "place", type: "disp.matrix", count: 3, params: { size: 16 } },
        TILE[1],
        TILE[2],
      ]),
      context,
    );

    expect(result.document).toBe(empty);
    expect(result.problems[0]).toContain("tile");
  });

  it("wires straight across where the widths already match", () => {
    const result = executeSteps(
      createEmptyDocument(),
      lookupNode,
      indexed([
        MATRIX_AND_PAD[0],
        MATRIX_AND_PAD[1],
        { ...MATRIX_AND_PAD[2], via: "bus.split" } as PlanStep,
      ]),
      context,
    );

    expect(Object.values(result.document.nodes)).toHaveLength(2);
    expect(Object.values(result.document.wires)).toHaveLength(16);
  });
});

describe("groupSteps", () => {
  it("keeps run controls and undo where they were asked for, between edits", () => {
    const place: PlanStep = {
      op: "place",
      type: "io.led",
      count: 1,
      params: {},
    };
    const groups = groupSteps([
      { op: "history", action: "undo" },
      place,
      place,
      { op: "run", action: "play" },
      place,
    ]);

    expect(groups.map((group) => group.kind)).toEqual([
      "control",
      "document",
      "control",
      "document",
    ]);
    // The two places in a row are one edit, and keep their plan indices so
    // a later `placed` target still finds them.
    expect(groups[1]).toEqual({
      kind: "document",
      steps: [
        { index: 1, step: place },
        { index: 2, step: place },
      ],
    });
  });
});
