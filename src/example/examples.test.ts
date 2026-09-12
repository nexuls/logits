import { describe, expect, it } from "vitest";
import { serialize } from "@/lib/circuit/io";
import { buildNetlist } from "@/lib/circuit/netlist";
import { lookupNode } from "@/lib/nodes/registry";
import { examples } from "./index";

/**
 * The shipped circuits are the one place a hand-written document reaches a
 * user, so they are held to the standard the editor would hold them to: they
 * load whole, every type is in the registry, every wire lands on a pin that
 * exists, and the whole thing compiles without an error diagnostic.
 */

describe("examples", () => {
  it("loads every catalog entry", () => {
    // `index.ts` drops an example that fails to load, so a short list here is
    // an authoring mistake in one of the JSON files.
    expect(examples.map((example) => example.name)).toEqual([
      "Gate sampler",
      "Half adder",
      "Full adder",
      "2-to-1 multiplexer",
      "SR latch (NOR)",
      "Tri-state bus",
      "Master-slave flip-flop",
      "Four-function calculator",
    ]);
  });

  it("gives every example a unique id and a summary", () => {
    const ids = examples.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const example of examples) {
      expect(example.summary.length).toBeGreaterThan(0);
    }
  });

  it.each(
    examples.map((example) => [example.name, example] as const),
  )("%s round-trips and compiles cleanly", (_name, example) => {
    expect(() => serialize(example.document)).not.toThrow();

    const { diagnostics } = buildNetlist(example.document, lookupNode);
    expect(
      diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ).toEqual([]);
  });

  it("uses only node types the registry has", () => {
    for (const example of examples) {
      for (const node of Object.values(example.document.nodes)) {
        expect(lookupNode(node.type), node.type).toBeDefined();
      }
    }
  });
});
