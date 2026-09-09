import { z } from "zod";
import { MAX_SCALE, MIN_SCALE } from "./coords";
import { createDocumentId } from "./ids";
import {
  type CircuitDocument,
  type CircuitNode,
  circuitDocumentSchema,
  circuitNodeSchema,
  isWireAnchor,
  type Wire,
  wireSchema,
} from "./schema";

/**
 * Serialisation, versioning and migration. This is the only module that knows
 * about `version`, and it is pure — it takes and returns strings, never touches
 * `localStorage`. The browser side of persistence lives in `src/state/`.
 */

export const CURRENT_VERSION = 3;

export const FILE_EXTENSION = ".logits.json";
export const FILE_MIME_TYPE = "application/json";

/**
 * `MIGRATIONS[n]` upgrades a version `n + 1` document to version `n + 2`, so
 * index 0 is `migrate_1_to_2`. Migrations run on raw parsed JSON, before schema
 * validation, because an old document is not valid against the current schema.
 * Never change the meaning of an existing field in place — add a migration.
 */
const MIGRATIONS: readonly ((
  doc: Record<string, unknown>,
) => Record<string, unknown>)[] = [migrate_1_to_2, migrate_2_to_3];

/**
 * v2 added the optional `defaultZoom`. A v1 document is already a valid v2 one
 * without it — absent means 100% — so there is nothing to rewrite. The step
 * exists because the version still has to move: a v2 file carrying a zoom
 * would otherwise open silently in a v1 build that drops the field on the next
 * save.
 */
function migrate_1_to_2(doc: Record<string, unknown>): Record<string, unknown> {
  return doc;
}

/**
 * v3 let a wire's `from` be a tap on another wire rather than a pin, which is
 * how a branch is stored. Every v2 wire is pin-to-pin, and a `PinRef` is still
 * a valid `from`, so again there is nothing to rewrite — but a v3 file
 * containing a branch must not open in a v2 build, which would read the
 * anchored end as a malformed `PinRef` and drop the wire.
 */
function migrate_2_to_3(doc: Record<string, unknown>): Record<string, unknown> {
  return doc;
}

export type LoadIssueCode =
  | "invalid-json"
  | "not-an-object"
  | "missing-version"
  | "unsupported-version"
  | "invalid-document"
  | "invalid-node"
  | "invalid-wire"
  | "dangling-wire";

export type LoadIssue = {
  code: LoadIssueCode;
  message: string;
  /** Key of the offending node or wire, when the issue is element-scoped. */
  elementId?: string;
};

export type LoadResult =
  | { ok: true; document: CircuitDocument; issues: LoadIssue[] }
  | { ok: false; issues: LoadIssue[] };

export function createEmptyDocument(
  name = "Untitled circuit",
): CircuitDocument {
  return {
    version: CURRENT_VERSION,
    id: createDocumentId(),
    name,
    nodes: {},
    wires: {},
  };
}

/** Validates before writing so a malformed document can never reach storage. */
export function serialize(document: CircuitDocument): string {
  return JSON.stringify(circuitDocumentSchema.parse(document));
}

/**
 * Defensive by contract: an untrusted file must not be able to crash the
 * editor. A document that is structurally sound but contains a few broken
 * elements loads without them, and every drop is reported as an issue rather
 * than thrown — diagnostics are data.
 */
export function deserialize(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid-json",
          message: error instanceof Error ? error.message : "Malformed JSON",
        },
      ],
    };
  }
  return fromJson(raw);
}

/** `deserialize` for a value that has already been through `JSON.parse`. */
export function fromJson(raw: unknown): LoadResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ code: "not-an-object", message: "Not a circuit document" }],
    };
  }

  const migrated = migrate(raw as Record<string, unknown>);
  if (!migrated.ok) return migrated;

  return salvage(migrated.value);
}

function migrate(
  raw: Record<string, unknown>,
):
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; issues: LoadIssue[] } {
  const version = raw.version;
  if (
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return {
      ok: false,
      issues: [
        { code: "missing-version", message: "Document has no schema version" },
      ],
    };
  }
  if (version > CURRENT_VERSION) {
    return {
      ok: false,
      issues: [
        {
          code: "unsupported-version",
          message: `Document is version ${version}; this build reads up to ${CURRENT_VERSION}. Update the app.`,
        },
      ],
    };
  }

  let value = raw;
  for (let v = version; v < CURRENT_VERSION; v++) {
    value = MIGRATIONS[v - 1](value);
  }
  return { ok: true, value: { ...value, version: CURRENT_VERSION } };
}

/**
 * Parses element by element so one corrupt node does not lose the rest of the
 * circuit. Unknown node *types* are preserved verbatim here; turning them into
 * placeholders is the registry's job at load time, and doing it in the schema
 * would silently discard params that must round-trip.
 */
function salvage(raw: Record<string, unknown>): LoadResult {
  const envelope = z
    .object({
      version: z.int().positive(),
      id: z.string().min(1).max(64),
      name: z.string().min(1).max(200).catch("Untitled circuit"),
      nodes: z.record(z.string(), z.unknown()).catch({}),
      wires: z.record(z.string(), z.unknown()).catch({}),
      // An out-of-range or non-numeric zoom falls back to "unset" rather than
      // failing the document: a bad view preference is not worth a circuit.
      defaultZoom: z
        .number()
        .min(MIN_SCALE)
        .max(MAX_SCALE)
        .optional()
        .catch(undefined),
      subcircuits: z.record(z.string(), z.unknown()).optional(),
    })
    .safeParse(raw);

  if (!envelope.success) {
    return {
      ok: false,
      issues: [
        {
          code: "invalid-document",
          message: z.prettifyError(envelope.error),
        },
      ],
    };
  }

  const issues: LoadIssue[] = [];
  const nodes: Record<string, CircuitNode> = {};
  for (const [key, candidate] of Object.entries(envelope.data.nodes)) {
    const node = circuitNodeSchema.safeParse(candidate);
    if (!node.success) {
      issues.push({
        code: "invalid-node",
        elementId: key,
        message: z.prettifyError(node.error),
      });
      continue;
    }
    // The record key is the id of record; a mismatched `id` field is repaired
    // rather than rejected, so a hand-edited file still opens.
    nodes[key] = node.data.id === key ? node.data : { ...node.data, id: key };
  }

  const wires: Record<string, Wire> = {};
  for (const [key, candidate] of Object.entries(envelope.data.wires)) {
    const wire = wireSchema.safeParse(candidate);
    if (!wire.success) {
      issues.push({
        code: "invalid-wire",
        elementId: key,
        message: z.prettifyError(wire.error),
      });
      continue;
    }
    const { from, to } = wire.data;
    const fromNode = isWireAnchor(from) ? true : Boolean(nodes[from.nodeId]);
    if (!fromNode || !nodes[to.nodeId]) {
      issues.push({
        code: "dangling-wire",
        elementId: key,
        message: "Wire references a node that is not in the document",
      });
      continue;
    }
    wires[key] = wire.data.id === key ? wire.data : { ...wire.data, id: key };
  }

  // Anchors are checked after every wire is in, since a branch may be listed
  // before the wire it taps. A branch whose target did not survive the pass
  // above has nowhere to start from, so it goes the same way a wire missing a
  // node does rather than being kept as an edge nothing can draw.
  for (const [key, wire] of Object.entries(wires)) {
    if (!isWireAnchor(wire.from)) continue;

    const target = wires[wire.from.wireId];
    const bends = target?.waypoints?.length ?? 0;
    if (!target || wire.from.waypoint >= bends) {
      issues.push({
        code: "dangling-wire",
        elementId: key,
        message: "Branch references a wire or bend that is not in the document",
      });
      delete wires[key];
    }
  }

  const subcircuits: Record<string, CircuitDocument> = {};
  for (const [key, candidate] of Object.entries(
    envelope.data.subcircuits ?? {},
  )) {
    const nested = fromJson(candidate);
    if (!nested.ok) {
      issues.push({
        code: "invalid-document",
        elementId: key,
        message: `Subcircuit "${key}": ${nested.issues[0]?.message ?? "invalid"}`,
      });
      continue;
    }
    issues.push(...nested.issues);
    subcircuits[key] = nested.document;
  }

  const document: CircuitDocument = {
    version: CURRENT_VERSION,
    id: envelope.data.id,
    name: envelope.data.name,
    nodes,
    wires,
  };
  if (envelope.data.defaultZoom !== undefined) {
    document.defaultZoom = envelope.data.defaultZoom;
  }
  if (Object.keys(subcircuits).length > 0) document.subcircuits = subcircuits;

  return { ok: true, document, issues };
}
