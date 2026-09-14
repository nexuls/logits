import { beforeEach, describe, expect, it } from "vitest";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { addNode, setLinkedNodeParams } from "./commands";
import { groupId, listGroups } from "./groups";
import { createEmptyDocument } from "./io";
import type { CircuitDocument } from "./schema";

function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const tunnel = requireNode("bus.tunnel");
const and = requireNode("gate.and");

let doc: CircuitDocument;

beforeEach(() => {
  doc = createEmptyDocument("Test circuit");
});

function place(params: Record<string, string | number>): string {
  const result = addNode(doc, tunnel, { position: { x: 0, y: 0 }, params });
  doc = result.document;
  return result.nodeId;
}

describe("listGroups", () => {
  it("lists each named network once, with its members and width", () => {
    const a = place({ name: "CLK", width: 1 });
    const b = place({ name: " CLK ", width: 1 });
    place({ name: "BUS", width: 8 });
    place({ name: "", width: 4 });

    const groups = listGroups(doc, "bus.tunnel", lookupNode);
    expect(groups.map((group) => group.name)).toEqual(["BUS", "CLK"]);
    expect(groups[1].memberIds).toEqual([a, b].sort());
    expect(groups[0].shared.width).toEqual({ value: 8, mixed: false });
  });

  it("marks a width the members disagree on as mixed", () => {
    place({ name: "D", width: 1 });
    place({ name: "D", width: 4 });

    expect(
      listGroups(doc, "bus.tunnel", lookupNode)[0].shared.width.mixed,
    ).toBe(true);
  });

  it("does not group a blank name or an ungrouped type", () => {
    const blank = place({ name: "  ", width: 1 });
    const gate = addNode(doc, and, { position: { x: 0, y: 0 } });

    expect(groupId(doc.nodes[blank], tunnel)).toBeNull();
    expect(groupId(gate.document.nodes[gate.nodeId], and)).toBeNull();
  });
});

describe("setLinkedNodeParams", () => {
  it("writes a width change to every tunnel on the network", () => {
    const a = place({ name: "BUS", width: 4 });
    const b = place({ name: "BUS", width: 4 });
    const other = place({ name: "CLK", width: 1 });

    const next = setLinkedNodeParams(doc, lookupNode, a, { width: 8 });
    expect(next.nodes[a].params.width).toBe(8);
    expect(next.nodes[b].params.width).toBe(8);
    expect(next.nodes[other].params.width).toBe(1);
  });

  it("adopts the network's width when joining it", () => {
    place({ name: "BUS", width: 8 });
    const joining = place({ name: "", width: 1 });

    const next = setLinkedNodeParams(doc, lookupNode, joining, { name: "BUS" });
    expect(next.nodes[joining].params).toMatchObject({ name: "BUS", width: 8 });
  });

  it("lets a patch that sets both name and width win over the network", () => {
    const member = place({ name: "BUS", width: 8 });
    const joining = place({ name: "", width: 1 });

    const next = setLinkedNodeParams(doc, lookupNode, joining, {
      name: "BUS",
      width: 16,
    });
    expect(next.nodes[member].params.width).toBe(16);
  });

  it("keeps its own width when naming a network that does not exist yet", () => {
    const lone = place({ name: "", width: 4 });

    const next = setLinkedNodeParams(doc, lookupNode, lone, { name: "NEW" });
    expect(next.nodes[lone].params).toMatchObject({ name: "NEW", width: 4 });
  });

  it("does not touch other nodes for an ungrouped type", () => {
    const gate = addNode(doc, and, { position: { x: 0, y: 0 } });
    const next = setLinkedNodeParams(gate.document, lookupNode, gate.nodeId, {
      width: 4,
    });
    expect(next.nodes[gate.nodeId].params.width).toBe(4);
  });
});
