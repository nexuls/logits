import { z } from "zod";
import { MAX_SCALE, MIN_SCALE } from "./coords";

/**
 * Runtime schemas for the circuit document.
 *
 * These are the source of truth for the model types — every type in this file
 * is inferred from its schema so a schema and its type cannot drift apart. The
 * document is plain serialisable data: no class instances, no functions, no
 * `Map`/`Set`. See artifacts/03-data-model.md.
 */

/** Ids are opaque strings from `./ids`; nothing may parse or order them. */
export const idSchema = z.string().min(1).max(64);

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type Point = z.infer<typeof pointSchema>;

export const pinRefSchema = z.object({
  nodeId: idSchema,
  pinId: z.string().min(1).max(64),
});
export type PinRef = z.infer<typeof pinRefSchema>;

export const rotationSchema = z.literal([0, 90, 180, 270]);
export type Rotation = z.infer<typeof rotationSchema>;

export const circuitNodeSchema = z.object({
  id: idSchema,
  /** Registry key, e.g. `"gate.and"`. Part of the save format; never renamed. */
  type: z.string().min(1).max(64),
  /** World coordinates of the node's top-left, in canvas units — not pixels. */
  position: pointSchema,
  rotation: rotationSchema.optional(),
  label: z.string().max(200).optional(),
  /** Shape is validated against the node definition's `paramsSchema`, not here. */
  params: z.record(z.string(), z.json()),
});
export type CircuitNode = z.infer<typeof circuitNodeSchema>;

export const wireSchema = z.object({
  id: idSchema,
  /** An output or inout pin. */
  from: pinRefSchema,
  /** An input or inout pin. */
  to: pinRefSchema,
  waypoints: z.array(pointSchema).max(256).optional(),
});
export type Wire = z.infer<typeof wireSchema>;

const circuitDocumentBaseSchema = z.object({
  /** Save-format version; bump and add a migration in `./io` on every change. */
  version: z.int().positive(),
  id: idSchema,
  name: z.string().min(1).max(200),
  nodes: z.record(idSchema, circuitNodeSchema),
  wires: z.record(idSchema, wireSchema),
  /**
   * Scale the editor opens this circuit at, and what "reset view" returns to.
   * Absent means 100%, so a circuit that never set one serialises exactly as
   * it did before the field existed. Bounded by the viewport's own zoom
   * limits — a document must not be able to ask for a scale the canvas
   * refuses to render.
   */
  defaultZoom: z.number().min(MIN_SCALE).max(MAX_SCALE).optional(),
});

/**
 * `subcircuits` is the one hand-written part of the model: a document may
 * embed user-defined chips, which are documents themselves (phase 4).
 */
export type CircuitDocument = z.infer<typeof circuitDocumentBaseSchema> & {
  subcircuits?: Record<string, CircuitDocument>;
};

export const circuitDocumentSchema: z.ZodType<CircuitDocument> =
  circuitDocumentBaseSchema.extend({
    get subcircuits() {
      return z.record(z.string(), circuitDocumentSchema).optional();
    },
  });

/**
 * Pin layout is declared by the node *definition* and never stored in the
 * document, so changing a gate's pins does not migrate saved circuits. The
 * schema exists to validate definitions, not files.
 */
export const pinSpecSchema = z.object({
  /** Stable within the node type and part of the save format; never renamed. */
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  direction: z.literal(["in", "out", "inout"]),
  width: z.int().min(1).max(64),
  side: z.literal(["left", "right", "top", "bottom"]),
  /** Position along that side, in grid units. */
  offset: z.number().finite(),
  /**
   * True when this output may drive `Z` — a bus driver, an open-drain pin.
   * Declared here so `buildNetlist` can tell a legitimate shared bus from a
   * short circuit without ever looking at a node `type`. `inout` pins are
   * tri-state by definition and need not set it.
   */
  tristate: z.boolean().optional(),
});
export type PinSpec = z.infer<typeof pinSpecSchema>;

/**
 * Index entry for the projects list. Derived from a document on save; the
 * document itself remains the source of truth.
 */
export const projectMetaSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(200),
  /** Epoch milliseconds. Format it on the client — a label baked in here
   *  would hydrate mismatched against the server render. */
  updatedAt: z.int().nonnegative(),
  nodeCount: z.int().nonnegative(),
  pinned: z.boolean().optional(),
});
export type ProjectMeta = z.infer<typeof projectMetaSchema>;
