import { describe, expect, it } from "vitest";
import {
  CURRENT_VERSION,
  createEmptyDocument,
  deserialize,
  fromJson,
  type LoadIssueCode,
  serialize,
} from "./io";
import type { CircuitDocument } from "./schema";

function documentFixture(): CircuitDocument {
  return {
    version: CURRENT_VERSION,
    id: "d_fixture",
    name: "Half adder",
    nodes: {
      n_a: {
        id: "n_a",
        type: "gate.xor",
        position: { x: 0, y: 0 },
        params: {},
      },
      n_b: {
        id: "n_b",
        type: "gate.and",
        position: { x: 80, y: 0 },
        rotation: 90,
        label: "carry",
        params: { inputs: 2 },
      },
    },
    wires: {
      w_1: {
        id: "w_1",
        from: { nodeId: "n_a", pinId: "y" },
        to: { nodeId: "n_b", pinId: "a" },
        waypoints: [{ x: 60, y: 0 }],
      },
    },
  };
}

const codes = (issues: { code: LoadIssueCode }[]) => issues.map((i) => i.code);

describe("createEmptyDocument", () => {
  it("is valid, current, and unique per call", () => {
    const first = createEmptyDocument();
    const second = createEmptyDocument("Named");

    expect(first.version).toBe(CURRENT_VERSION);
    expect(second.name).toBe("Named");
    expect(first.id).not.toBe(second.id);
    expect(deserialize(serialize(first)).ok).toBe(true);
  });
});

describe("round trip", () => {
  it("preserves the document exactly", () => {
    const document = documentFixture();
    const result = deserialize(serialize(document));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(document);
    expect(result.issues).toEqual([]);
  });

  it("carries nested subcircuits through", () => {
    const document: CircuitDocument = {
      ...documentFixture(),
      subcircuits: { "chip.adder": createEmptyDocument("Adder") },
    };
    const result = deserialize(serialize(document));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.subcircuits?.["chip.adder"]?.name).toBe("Adder");
  });

  it("refuses to write a document that is not valid", () => {
    const broken = { ...documentFixture(), name: "" } as CircuitDocument;
    expect(() => serialize(broken)).toThrow();
  });
});

describe("rejected files", () => {
  it("reports malformed JSON instead of throwing", () => {
    const result = deserialize("{ not json");
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toEqual(["invalid-json"]);
  });

  it("rejects anything that is not an object", () => {
    expect(codes(fromJson([]).issues)).toEqual(["not-an-object"]);
    expect(codes(fromJson(null).issues)).toEqual(["not-an-object"]);
    expect(codes(fromJson("nope").issues)).toEqual(["not-an-object"]);
  });

  it("rejects a document with no usable version", () => {
    expect(codes(fromJson({ id: "d_1" }).issues)).toEqual(["missing-version"]);
    expect(codes(fromJson({ version: 1.5 }).issues)).toEqual([
      "missing-version",
    ]);
  });

  it("refuses a document written by a newer build", () => {
    const result = fromJson({
      ...documentFixture(),
      version: CURRENT_VERSION + 1,
    });
    expect(result.ok).toBe(false);
    expect(codes(result.issues)).toEqual(["unsupported-version"]);
  });
});

describe("salvage", () => {
  it("drops a corrupt node and keeps the rest of the circuit", () => {
    const raw = documentFixture() as unknown as Record<string, unknown>;
    const nodes = raw.nodes as Record<string, unknown>;
    nodes.n_bad = { id: "n_bad", type: "gate.or" }; // no position

    const result = fromJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.document.nodes)).toEqual(["n_a", "n_b"]);
    expect(codes(result.issues)).toEqual(["invalid-node"]);
    expect(result.issues[0].elementId).toBe("n_bad");
  });

  it("drops a wire that points at a missing node", () => {
    const raw = documentFixture() as unknown as Record<string, unknown>;
    (raw.wires as Record<string, unknown>).w_2 = {
      id: "w_2",
      from: { nodeId: "n_a", pinId: "y" },
      to: { nodeId: "n_gone", pinId: "a" },
    };

    const result = fromJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.document.wires)).toEqual(["w_1"]);
    expect(codes(result.issues)).toEqual(["dangling-wire"]);
  });

  it("repairs an element whose id disagrees with its record key", () => {
    const raw = documentFixture() as unknown as Record<string, unknown>;
    const nodes = raw.nodes as Record<string, { id: string }>;
    nodes.n_a.id = "stale";

    const result = fromJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.n_a.id).toBe("n_a");
    expect(result.issues).toEqual([]);
  });

  it("falls back to a default name rather than losing the circuit", () => {
    const result = fromJson({ ...documentFixture(), name: 42 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.name).toBe("Untitled circuit");
    expect(Object.keys(result.document.nodes)).toHaveLength(2);
  });

  it("keeps an unknown node type verbatim so it can round-trip", () => {
    const raw = documentFixture();
    raw.nodes.n_a.type = "future.widget";
    raw.nodes.n_a.params = { mystery: [1, 2, 3] };

    const result = fromJson(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.nodes.n_a.type).toBe("future.widget");
    expect(result.document.nodes.n_a.params).toEqual({ mystery: [1, 2, 3] });
  });

  it("reports a broken subcircuit without failing the parent", () => {
    const result = fromJson({
      ...documentFixture(),
      subcircuits: { broken: { nope: true } },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(codes(result.issues)).toEqual(["invalid-document"]);
    expect(result.document.subcircuits).toBeUndefined();
  });
});
