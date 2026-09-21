import { describe, expect, it } from "vitest";
import { addNode, connect } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import type { NodeParams } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { matchPins } from "./wiring";

function place(
  document: CircuitDocument,
  type: string,
  params: NodeParams = {},
): { document: CircuitDocument; id: string } {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`no ${type}`);
  const result = addNode(document, definition, {
    position: { x: 0, y: 0 },
    params,
  });
  return { document: result.document, id: result.nodeId };
}

describe("matchPins", () => {
  it("wires same-named pins row for row", () => {
    const pad = place(createEmptyDocument(), "io.drawpad", {
      columns: 16,
      rows: 16,
    });
    const matrix = place(pad.document, "disp.matrix", { size: 16 });

    const pairs = matchPins(matrix.document, lookupNode, [matrix.id], [pad.id]);

    // Asked matrix-first, it still finds the pad is the one that drives.
    expect(pairs).toHaveLength(16);
    for (const pair of pairs) {
      expect(pair.from.nodeId).toBe(pad.id);
      expect(pair.to.nodeId).toBe(matrix.id);
      expect(pair.from.pinId).toBe(pair.to.pinId);
    }
  });

  it("feeds several sources into one element's inputs in order", () => {
    let document = createEmptyDocument();
    const switches: string[] = [];
    for (let k = 0; k < 2; k++) {
      const result = place(document, "io.switch");
      document = result.document;
      switches.push(result.id);
    }
    const gate = place(document, "gate.and");

    const pairs = matchPins(gate.document, lookupNode, switches, [gate.id]);

    expect(pairs.map((pair) => pair.from.nodeId)).toEqual(switches);
    expect(new Set(pairs.map((pair) => pair.to.pinId)).size).toBe(2);
  });

  it("prefers an input whose name abbreviates the driver", () => {
    const clock = place(createEmptyDocument(), "time.clock");
    const flipFlop = place(clock.document, "seq.dff");

    const pairs = matchPins(
      flipFlop.document,
      lookupNode,
      [clock.id],
      [flipFlop.id],
    );

    expect(pairs).toEqual([
      {
        from: { nodeId: clock.id, pinId: "out" },
        to: { nodeId: flipFlop.id, pinId: "clk" },
      },
    ]);
  });

  it("never offers an input that is already driven", () => {
    const a = place(createEmptyDocument(), "io.switch");
    const led = place(a.document, "io.led");
    const b = place(led.document, "io.switch");
    const wired = connect(
      b.document,
      lookupNode,
      { nodeId: a.id, pinId: "out" },
      { nodeId: led.id, pinId: "in" },
    );
    if (!wired.ok) throw new Error(wired.reason);

    expect(matchPins(wired.document, lookupNode, [b.id], [led.id])).toEqual([]);
  });

  it("honours a named pin, running the wire whichever way it implies", () => {
    const clock = place(createEmptyDocument(), "time.clock");
    const flipFlop = place(clock.document, "seq.dff");

    // "connect the flip-flop's D to the clock": the named end is an input, so
    // the other element drives it.
    const pairs = matchPins(
      flipFlop.document,
      lookupNode,
      [flipFlop.id],
      [clock.id],
      { fromPin: "d" },
    );

    expect(pairs).toEqual([
      {
        from: { nodeId: clock.id, pinId: "out" },
        to: { nodeId: flipFlop.id, pinId: "d" },
      },
    ]);
  });
});
