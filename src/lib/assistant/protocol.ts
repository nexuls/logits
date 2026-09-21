import { z } from "zod";

/**
 * What the chat sends to `/api/assistant` and what comes back.
 *
 * One schema for both ends, so the route validates exactly what the client is
 * allowed to send and the client validates exactly what the route promised.
 * The answer is a *plan* — data naming commands — never a document: the
 * document only ever changes on the client, through `src/state/document.ts`,
 * which keeps undo and autosave on one hook (Non-negotiable #9) and means a
 * plan that arrives late is checked against the document as it is *then*.
 */

export const MAX_MESSAGE_LENGTH = 500;
/** Enough to name anything on a typical canvas without a huge request. */
export const MAX_CONTEXT_NODES = 200;
/** The most copies one request may place; matches what the palette allows and then some. */
export const MAX_PLACE_COUNT = 16;

const typeSchema = z.string().min(1).max(64);

const contextNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: typeSchema,
  label: z.string().max(200).optional(),
  selected: z.boolean().optional(),
  /** Placed by the assistant's previous reply — what "them" usually means. */
  recent: z.boolean().optional(),
});
export type ContextNode = z.infer<typeof contextNodeSchema>;

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  nodes: z.array(contextNodeSchema).max(MAX_CONTEXT_NODES),
  /** The project's own chips, which are node types the registry does not know. */
  chips: z
    .array(z.object({ type: typeSchema, title: z.string().min(1).max(200) }))
    .max(64)
    .default([]),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/**
 * The elements a step acts on.
 *
 * `placed` points back at an earlier `place` step of the same plan, because
 * the nodes it creates have no ids until the client runs it. The rest are
 * resolved against the live document when the step runs, so a node deleted
 * between asking and answering is skipped rather than resurrected.
 */
export const targetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("placed"), step: z.int().nonnegative() }),
  z.object({ kind: z.literal("nodes"), ids: z.array(z.string()).max(256) }),
  z.object({ kind: z.literal("selection") }),
  z.object({ kind: z.literal("type"), type: typeSchema }),
  z.object({ kind: z.literal("all") }),
]);
export type Target = z.infer<typeof targetSchema>;

const paramsSchema = z.record(z.string(), z.json());
export type ParamPatch = z.infer<typeof paramsSchema>;

export const planStepSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("place"),
    type: typeSchema,
    count: z.int().min(1).max(MAX_PLACE_COUNT),
    params: paramsSchema,
  }),
  z.object({
    op: z.literal("connect"),
    from: targetSchema,
    /** Absent: wire the nodes of `from` to each other, left to right. */
    to: targetSchema.optional(),
    /** A pin the request named, by id. Falls back to matching when absent. */
    fromPin: z.string().max(64).optional(),
    toPin: z.string().max(64).optional(),
    /**
     * A node type to put between the two sides where their widths differ —
     * one per wide bus — found by its `reshape` declaration. Where the
     * widths already match, the wires go straight across.
     */
    via: typeSchema.optional(),
  }),
  z.object({ op: z.literal("delete"), target: targetSchema }),
  z.object({
    op: z.literal("set"),
    target: targetSchema,
    /** Only nodes of this type are changed: the params are its params. */
    type: typeSchema,
    params: paramsSchema,
  }),
  z.object({
    op: z.literal("rotate"),
    target: targetSchema,
    quarterTurns: z.int().min(-3).max(3),
  }),
  z.object({ op: z.literal("select"), target: targetSchema }),
  z.object({
    op: z.literal("run"),
    action: z.enum(["play", "pause", "step", "reset"]),
  }),
  z.object({ op: z.literal("history"), action: z.enum(["undo", "redo"]) }),
]);
export type PlanStep = z.infer<typeof planStepSchema>;

/** One judgment Jev made, kept so the chat can show how a request was read. */
const judgmentSchema = z.object({
  question: z.string(),
  answer: z.string(),
  confidence: z.number(),
});
export type Judgment = z.infer<typeof judgmentSchema>;

const segmentTraceSchema = z.object({
  text: z.string(),
  judgments: z.array(judgmentSchema),
});
export type SegmentTrace = z.infer<typeof segmentTraceSchema>;

export const assistantErrorSchema = z.enum([
  "unconfigured",
  "bad-request",
  "upstream",
  "timeout",
]);
export type AssistantError = z.infer<typeof assistantErrorSchema>;

export const assistantResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    plan: z.array(planStepSchema),
    /**
     * Why nothing was done, one line per doubt. Non-empty means `plan` is
     * empty: a request is carried out whole or not at all, because a half-run
     * "place X, place Y and wire them" is worse than a question.
     */
    unsure: z.array(z.string()),
    trace: z.array(segmentTraceSchema),
  }),
  z.object({
    ok: z.literal(false),
    error: assistantErrorSchema,
    message: z.string(),
  }),
]);
export type AssistantResponse = z.infer<typeof assistantResponseSchema>;

export const assistantStatusSchema = z.object({ available: z.boolean() });
export type AssistantStatus = z.infer<typeof assistantStatusSchema>;
