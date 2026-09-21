import {
  addNode,
  connect,
  deleteElements,
  rotateNodes,
  setLinkedNodeParams,
  topLeftForCenter,
} from "@/lib/circuit/commands";
import type { CircuitDocument, Point } from "@/lib/circuit/schema";
import type { NodeDefinition, NodeLookup, ParamSpec } from "@/lib/nodes/define";
import { arrangePlaced, type LayoutGroup } from "./layout";
import type { ParamPatch, PlanStep, Target } from "./protocol";
import { matchPins, planBridge } from "./wiring";

/**
 * Runs the document half of a plan as pure transforms over a document.
 *
 * Everything here goes through the same commands the canvas uses, so a plan
 * can do nothing a user could not, and the store applies the result as one
 * edit — one undo step for "place two things and wire them". Steps that are
 * not edits (running the simulation, undo) are the caller's; see
 * `isDocumentStep`.
 *
 * Every step is checked against the document as it is *now*, not as it was
 * when the request left: a target that has since been deleted is skipped and
 * said so, never recreated.
 */

export type ExecutionContext = {
  /** The centre of the view, where new parts go. */
  worldCenter: Point;
  /** Node ids selected when the request was sent. */
  selection: readonly string[];
  /** Nodes made by earlier `place` steps of the same plan, by step index. */
  placed: ReadonlyMap<number, readonly string[]>;
};

export type ExecutionResult = {
  document: CircuitDocument;
  /** `context.placed` plus whatever these steps placed. */
  placed: Map<number, string[]>;
  /** What to select afterwards; null leaves the selection as it is. */
  selection: string[] | null;
  /** One line per step, for the chat. */
  notes: string[];
  /**
   * Steps that could not be done. Any at all and `document` is the one that
   * came in: a request is carried out whole or not at all, and "placed the
   * parts but could not wire them" leaves the user a mess to clear up.
   */
  problems: string[];
};

/** Bounds what one bridged connect may add; 64 rows is the widest bus there is. */
const MAX_ADAPTERS = 64;

export type IndexedStep = { index: number; step: PlanStep };

type DocumentStep = Exclude<PlanStep, { op: "run" } | { op: "history" }>;

export function isDocumentStep(step: PlanStep): step is DocumentStep {
  return step.op !== "run" && step.op !== "history";
}

export type StepGroup =
  | { kind: "document"; steps: IndexedStep[] }
  | { kind: "control"; step: Exclude<PlanStep, DocumentStep> };

/**
 * Cuts a plan into runs of document steps — each one edit, one undo — with
 * the run controls and undo/redo between them, in the order they were asked
 * for. "Undo, then add an LED" must undo *before* the LED exists.
 */
export function groupSteps(plan: readonly PlanStep[]): StepGroup[] {
  const groups: StepGroup[] = [];
  plan.forEach((step, index) => {
    if (!isDocumentStep(step)) {
      groups.push({ kind: "control", step });
      return;
    }
    const last = groups.at(-1);
    if (last?.kind === "document") last.steps.push({ index, step });
    else groups.push({ kind: "document", steps: [{ index, step }] });
  });
  return groups;
}

export function executeSteps(
  document: CircuitDocument,
  lookup: NodeLookup,
  steps: readonly IndexedStep[],
  context: ExecutionContext,
): ExecutionResult {
  const placed = new Map<number, string[]>(
    [...context.placed].map(([index, ids]) => [index, [...ids]]),
  );
  const placedHere: number[] = [];
  /** Nodes a bridged connect put in between, one layout column per connect. */
  const between: string[][] = [];
  /** Nodes that tile as a grid, and how many across. */
  const grids = new Map<string, number>();
  const notes: string[] = [];
  const problems: string[] = [];
  let selection: string[] | null = null;
  let current = document;

  const resolve = (target: Target): string[] =>
    resolveTarget(current, target, context.selection, placed);

  for (const { index, step } of steps) {
    if (!isDocumentStep(step)) continue;

    switch (step.op) {
      case "place": {
        const definition = lookup(step.type);
        if (!definition) {
          problems.push(`This editor has no “${step.type}” element.`);
          break;
        }

        const { params, adjusted } = sanitizeParams(definition, step.params);
        const ids: string[] = [];
        for (let copy = 0; copy < step.count; copy++) {
          const result = addNode(current, definition, {
            position: topLeftForCenter(
              definition,
              { ...definition.defaultParams, ...params },
              0,
              context.worldCenter,
            ),
            params,
          });
          current = result.document;
          ids.push(result.nodeId);
        }

        placed.set(index, ids);
        placedHere.push(index);
        notes.push(
          `Placed ${step.count > 1 ? `${step.count} × ` : ""}${definition.title}${describeParams(definition, params)}.`,
        );
        for (const line of adjusted) notes.push(line);
        break;
      }

      case "connect": {
        const from = resolve(step.from);
        const to = step.to ? resolve(step.to) : [];
        const chain = step.to ? null : orderLeftToRight(current, from);
        if (chain && chain.length < 2) {
          problems.push("Wiring needs at least two elements.");
          break;
        }
        const pairs = chain
          ? chain.slice(1).map((id, at) => [[chain[at]], [id]] as const)
          : [[from, to] as const];

        let wires = 0;
        let adapters = 0;
        const failures: string[] = [];
        // Which way the signal ended up running, for the reply: the matcher
        // may have turned "wire the LED to the switch" around.
        let flow: { drivers: string[]; driven: string[] } | null = null;

        for (const [sources, sinks] of pairs) {
          if (sources.length === 0 || sinks.length === 0) continue;

          const adapter = step.via ? lookup(step.via) : undefined;
          if (adapter?.reshape) {
            const bridged = bridge(
              current,
              lookup,
              adapter,
              sources,
              sinks,
              context.worldCenter,
            );
            if (bridged.ok) {
              current = bridged.document;
              wires += bridged.wires;
              adapters += bridged.adapters.length;
              between.push(bridged.adapters);
              for (const id of bridged.panels) grids.set(id, bridged.columns);
              flow = bridged.flow;
              continue;
            }
            if (bridged.reason !== null) {
              failures.push(bridged.reason);
              continue;
            }
            // Same width on both sides: nothing to put in between.
          }

          const matched = matchPins(current, lookup, sources, sinks, {
            fromPin: step.fromPin,
            toPin: step.toPin,
          });
          for (const pair of matched) {
            const result = connect(current, lookup, pair.from, pair.to);
            if (!result.ok) continue;
            current = result.document;
            wires++;
          }
          if (matched.length > 0 && !chain) {
            const forward = sources.includes(matched[0].from.nodeId);
            flow = forward
              ? { drivers: [...sources], driven: [...sinks] }
              : { drivers: [...sinks], driven: [...sources] };
          }
        }

        const ends = chain
          ? describeNodes(current, lookup, chain)
          : `${describeNodes(current, lookup, from)} and ${describeNodes(current, lookup, to)}`;
        if (wires === 0) {
          problems.push(
            failures[0] ??
              `Found no free pins that match between ${ends}, so nothing could be wired.`,
          );
          break;
        }

        const described = chain
          ? `${ends} together`
          : flow
            ? `${describeNodes(current, lookup, flow.drivers)} to ${describeNodes(current, lookup, flow.driven)}`
            : ends;
        const through =
          adapters > 0 && step.via
            ? ` through ${adapters} × ${lookup(step.via)?.title ?? step.via}`
            : "";
        notes.push(
          `Wired ${described}${through} (${plural(wires, "connection")}).`,
        );
        break;
      }

      case "delete": {
        const ids = resolve(step.target);
        if (ids.length === 0) {
          problems.push("Found nothing to delete.");
          break;
        }
        const described = describeNodes(current, lookup, ids);
        current = deleteElements(current, { nodeIds: ids });
        notes.push(`Deleted ${described}.`);
        break;
      }

      case "set": {
        const definition = lookup(step.type);
        const ids = resolve(step.target).filter(
          (id) => current.nodes[id]?.type === step.type,
        );
        if (!definition || ids.length === 0) {
          problems.push("Found nothing to change.");
          break;
        }

        const { params, adjusted } = sanitizeParams(definition, step.params);
        if (Object.keys(params).length === 0) {
          problems.push(
            `Couldn't tell which setting of the ${definition.title} to change.`,
          );
          break;
        }
        for (const id of ids) {
          current = setLinkedNodeParams(current, lookup, id, params);
        }
        notes.push(
          `Changed ${describeNodes(current, lookup, ids)} to${describeParams(definition, params)}.`,
        );
        for (const line of adjusted) notes.push(line);
        break;
      }

      case "rotate": {
        const ids = resolve(step.target);
        if (ids.length === 0) {
          problems.push("Found nothing to rotate.");
          break;
        }
        current = rotateNodes(current, ids, step.quarterTurns);
        notes.push(`Rotated ${describeNodes(current, lookup, ids)}.`);
        break;
      }

      case "select": {
        selection = resolve(step.target);
        if (selection.length === 0) {
          problems.push("Found nothing to select.");
          break;
        }
        notes.push(`Selected ${describeNodes(current, lookup, selection)}.`);
        break;
      }
    }
  }

  if (problems.length > 0) {
    return {
      document,
      placed: new Map([...context.placed].map(([at, ids]) => [at, [...ids]])),
      selection: null,
      notes: [],
      problems,
    };
  }

  if (placedHere.length > 0 || between.length > 0) {
    const groups: LayoutGroup[] = placedHere.map((index) => {
      const ids = placed.get(index) ?? [];
      const columns = ids.length > 1 ? grids.get(ids[0]) : undefined;
      return columns ? { ids, columns } : { ids };
    });
    for (const ids of between) groups.push({ ids });
    current = arrangePlaced(current, lookup, groups, context.worldCenter);
    selection ??= placedHere
      .flatMap((index) => placed.get(index) ?? [])
      .filter((id) => current.nodes[id]);
  }

  return { document: current, placed, selection, notes, problems };
}

type Bridged =
  | {
      ok: true;
      document: CircuitDocument;
      wires: number;
      adapters: string[];
      panels: string[];
      columns: number;
      flow: { drivers: string[]; driven: string[] };
    }
  | { ok: false; reason: string | null };

/**
 * One adapter per wide bus, configured to cut it (or build it) in lanes the
 * width of the narrow side, and every lane wired to the panel pin
 * `planBridge` tiles it onto — most significant lane first, where the
 * adapter counts from the least.
 */
function bridge(
  document: CircuitDocument,
  lookup: NodeLookup,
  adapter: NodeDefinition,
  sources: readonly string[],
  sinks: readonly string[],
  worldCenter: Point,
): Bridged {
  const reshape = adapter.reshape;
  if (!reshape) return { ok: false, reason: null };

  const planned = planBridge(document, lookup, sources, sinks, reshape.kind);
  if (!planned.ok) return planned;

  const { rows, laneWidth, columns, panels } = planned.bridge;
  if (rows.length > MAX_ADAPTERS) {
    return {
      ok: false,
      reason: `That needs ${rows.length} × ${adapter.title}, more than the ${MAX_ADAPTERS} one request may add.`,
    };
  }

  const params = reshape.params(
    Array.from({ length: columns }, () => laneWidth),
  );
  let current = document;
  let wires = 0;
  const adapters: string[] = [];

  for (const row of rows) {
    const added = addNode(current, adapter, {
      position: topLeftForCenter(
        adapter,
        { ...adapter.defaultParams, ...params },
        0,
        worldCenter,
      ),
      params,
    });
    current = added.document;
    adapters.push(added.nodeId);

    const links = [
      [row.wide, { nodeId: added.nodeId, pinId: reshape.wide }],
      ...row.lanes.map(
        (lane, column) =>
          [
            lane,
            { nodeId: added.nodeId, pinId: reshape.lane(columns - 1 - column) },
          ] as const,
      ),
    ] as const;
    for (const [a, b] of links) {
      const result = connect(current, lookup, a, b);
      if (!result.ok) continue;
      current = result.document;
      wires++;
    }
  }

  const wideNodes = [...new Set(rows.map((row) => row.wide.nodeId))];
  return {
    ok: true,
    document: current,
    wires,
    adapters,
    panels,
    columns,
    flow:
      reshape.kind === "split"
        ? { drivers: wideNodes, driven: panels }
        : { drivers: panels, driven: wideNodes },
  };
}

function resolveTarget(
  document: CircuitDocument,
  target: Target,
  selection: readonly string[],
  placed: ReadonlyMap<number, readonly string[]>,
): string[] {
  const ids = (() => {
    switch (target.kind) {
      case "placed":
        return placed.get(target.step) ?? [];
      case "nodes":
        return target.ids;
      case "selection":
        return selection;
      case "type":
        return Object.values(document.nodes)
          .filter((node) => node.type === target.type)
          .map((node) => node.id);
      case "all":
        return Object.keys(document.nodes);
    }
  })();
  return [...new Set(ids)].filter((id) => document.nodes[id]);
}

/** Reading order, so "wire these together" chains them the way they look. */
function orderLeftToRight(
  document: CircuitDocument,
  ids: readonly string[],
): string[] {
  return [...ids].sort((a, b) => {
    const pa = document.nodes[a].position;
    const pb = document.nodes[b].position;
    return pa.x - pb.x || pa.y - pb.y;
  });
}

/**
 * Keeps only params the definition offers an editor for, each within the
 * limits that editor would enforce — the same bounds a user is held to. What
 * had to move is reported rather than silently changed.
 */
export function sanitizeParams(
  definition: NodeDefinition,
  patch: ParamPatch,
): { params: ParamPatch; adjusted: string[] } {
  const params: ParamPatch = {};
  const adjusted: string[] = [];

  for (const spec of definition.paramsSchema ?? []) {
    const value = patch[spec.key];
    if (value === undefined || value === null) continue;

    switch (spec.kind) {
      case "int": {
        if (typeof value !== "number" || !Number.isFinite(value)) break;
        const whole = Math.round(value);
        const clamped = Math.min(
          spec.max ?? Number.MAX_SAFE_INTEGER,
          Math.max(spec.min ?? Number.MIN_SAFE_INTEGER, whole),
        );
        params[spec.key] = clamped;
        if (clamped !== whole) {
          adjusted.push(
            `${spec.label} ${whole} is out of range for the ${definition.title}, so it is ${clamped}.`,
          );
        }
        break;
      }
      case "bool":
        if (typeof value === "boolean") params[spec.key] = value;
        break;
      case "text":
        if (typeof value === "string") {
          params[spec.key] = value.slice(0, spec.maxLength ?? 2000);
        }
        break;
      case "select":
      case "color":
        if (spec.options.some((option) => option.value === value)) {
          params[spec.key] = value;
        }
        break;
    }
  }

  return { params, adjusted };
}

/** " (Size 16, Colour Green)", in the inspector's own words. */
function describeParams(
  definition: NodeDefinition,
  params: ParamPatch,
): string {
  const parts = (definition.paramsSchema ?? []).flatMap((spec) => {
    const value = params[spec.key];
    return value === undefined
      ? []
      : [`${spec.label} ${formatValue(spec, value)}`];
  });
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

function formatValue(spec: ParamSpec, value: ParamPatch[string]): string {
  if (spec.kind === "select" || spec.kind === "color") {
    return (
      spec.options.find((option) => option.value === value)?.label ??
      String(value)
    );
  }
  if (spec.kind === "bool") return value ? "on" : "off";
  if (spec.kind === "text") return `“${String(value)}”`;
  return String(value);
}

/** "the Draw pad", "3 LEDs", "4 elements". */
function describeNodes(
  document: CircuitDocument,
  lookup: NodeLookup,
  ids: readonly string[],
): string {
  const titles = ids.map((id) => {
    const node = document.nodes[id];
    return node ? (lookup(node.type)?.title ?? node.type) : "element";
  });
  const distinct = new Set(titles);
  if (ids.length === 1) {
    const label = document.nodes[ids[0]]?.label;
    return label ? `the ${titles[0]} “${label}”` : `the ${titles[0]}`;
  }
  if (distinct.size === 1) return `${ids.length} × ${titles[0]}`;
  return plural(ids.length, "element");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
