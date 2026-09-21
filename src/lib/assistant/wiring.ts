import type { CircuitDocument, PinRef, PinSpec } from "@/lib/circuit/schema";
import type { NodeLookup } from "@/lib/nodes/define";
import { pinSpecsFor } from "@/lib/nodes/define";

/**
 * Which pins "connect A to B" means, when the request did not say.
 *
 * Read entirely off the pins the definitions declare — names, directions and
 * widths — so it knows no node type (Non-negotiable #4), and a node added
 * tomorrow wires up the same way. The rules, in order:
 *
 * 1. **Same name, same width.** A draw pad's `R0…R15` onto a matrix's
 *    `R0…R15` is sixteen wires, not one.
 * 2. **In order, same width**, preferring an input whose name echoes the
 *    driver's title — a clock onto `CLK` rather than `D`.
 *
 * Both directions are tried and the one that makes more wires wins, so "wire
 * the LED to the switch" still drives the LED. An input something already
 * drives is never offered: two drivers on a net is a diagnostic, not a wire
 * the user asked for.
 */

export type PinPair = { from: PinRef; to: PinRef };

export type PinHints = { fromPin?: string; toPin?: string };

type Endpoint = { nodeId: string; pin: PinSpec; title: string };

export function matchPins(
  document: CircuitDocument,
  lookup: NodeLookup,
  sources: readonly string[],
  sinks: readonly string[],
  hints: PinHints = {},
): PinPair[] {
  if (
    (hints.fromPin || hints.toPin) &&
    sources.length > 0 &&
    sinks.length > 0
  ) {
    const pair = hintedPair(document, lookup, sources[0], sinks[0], hints);
    if (pair) return [pair];
  }

  const forward = autoMatch(document, lookup, sources, sinks);
  const backward = autoMatch(document, lookup, sinks, sources);
  return backward.length > forward.length ? backward : forward;
}

function autoMatch(
  document: CircuitDocument,
  lookup: NodeLookup,
  sources: readonly string[],
  sinks: readonly string[],
): PinPair[] {
  const driven = drivenPins(document);
  const outs = endpoints(document, lookup, sources).filter(
    (end) => end.pin.direction !== "in",
  );
  const ins = endpoints(document, lookup, sinks).filter(
    (end) =>
      end.pin.direction !== "out" && !driven.has(key(end.nodeId, end.pin.id)),
  );
  if (outs.length === 0 || ins.length === 0) return [];

  const byName = pair(outs, ins, (out, candidates) =>
    candidates.find(
      (end) => end.pin.name.toLowerCase() === out.pin.name.toLowerCase(),
    ),
  );
  if (byName.length > 0) return byName;

  return pair(
    outs,
    ins,
    (out, candidates) =>
      candidates.find((end) => echoes(end.pin.name, out.title)) ??
      candidates[0],
  );
}

/** Walks the outputs, giving each the input `pick` chooses among the free ones of its width. */
function pair(
  outs: readonly Endpoint[],
  ins: readonly Endpoint[],
  pick: (out: Endpoint, candidates: Endpoint[]) => Endpoint | undefined,
): PinPair[] {
  const used = new Set<string>();
  const pairs: PinPair[] = [];

  for (const out of outs) {
    const candidates = ins.filter(
      (end) =>
        end.nodeId !== out.nodeId &&
        end.pin.width === out.pin.width &&
        !used.has(key(end.nodeId, end.pin.id)),
    );
    const chosen = pick(out, candidates);
    if (!chosen) continue;

    used.add(key(chosen.nodeId, chosen.pin.id));
    pairs.push({
      from: { nodeId: out.nodeId, pinId: out.pin.id },
      to: { nodeId: chosen.nodeId, pinId: chosen.pin.id },
    });
  }

  return pairs;
}

/**
 * One wire, with at least one end named. The named end decides which way it
 * runs — naming an input on the first element means the second drives it —
 * and the other end is the first free pin of the same width.
 */
function hintedPair(
  document: CircuitDocument,
  lookup: NodeLookup,
  a: string,
  b: string,
  hints: PinHints,
): PinPair | null {
  const [endsA, endsB] = [a, b].map((id) => endpoints(document, lookup, [id]));
  const named = (ends: Endpoint[], pin?: string) =>
    pin
      ? ends.find(
          (end) =>
            end.pin.id === pin ||
            end.pin.name.toLowerCase() === pin.toLowerCase(),
        )
      : undefined;

  let endA = named(endsA, hints.fromPin);
  let endB = named(endsB, hints.toPin);
  if (!endA && !endB) return null;

  const aDrives = endA
    ? endA.pin.direction !== "in"
    : endB?.pin.direction !== "out";
  const driven = drivenPins(document);
  const free = (ends: Endpoint[], drives: boolean, width?: number) =>
    ends.find(
      (end) =>
        (drives
          ? end.pin.direction !== "in"
          : end.pin.direction !== "out" &&
            !driven.has(key(end.nodeId, end.pin.id))) &&
        (width === undefined || end.pin.width === width),
    );

  endA ??= free(endsA, aDrives, endB?.pin.width);
  endB ??= free(endsB, !aDrives, endA?.pin.width);
  if (!endA || !endB) return null;

  const [from, to] = aDrives ? [endA, endB] : [endB, endA];
  return {
    from: { nodeId: from.nodeId, pinId: from.pin.id },
    to: { nodeId: to.nodeId, pinId: to.pin.id },
  };
}

function endpoints(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeIds: readonly string[],
): Endpoint[] {
  return nodeIds.flatMap((nodeId) => {
    const node = document.nodes[nodeId];
    if (!node) return [];
    const title = node.label ?? lookup(node.type)?.title ?? node.type;
    return pinSpecsFor(node, lookup).map((pin) => ({ nodeId, pin, title }));
  });
}

/** Inputs something already drives. */
function drivenPins(document: CircuitDocument): Set<string> {
  const driven = new Set<string>();
  for (const wire of Object.values(document.wires)) {
    driven.add(key(wire.to.nodeId, wire.to.pinId));
  }
  return driven;
}

function key(nodeId: string, pinId: string): string {
  return `${nodeId}:${pinId}`;
}

/**
 * Whether a pin name reads as an abbreviation of a title: its letters, in
 * order, inside it — `CLK` in "Clock", `EN` in "Enable". Single letters say
 * nothing, so they never echo.
 */
function echoes(pinName: string, title: string): boolean {
  const letters = pinName.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length < 2) return false;

  const haystack = title.toLowerCase();
  let at = 0;
  for (const letter of letters) {
    at = haystack.indexOf(letter, at);
    if (at === -1) return false;
    at++;
  }
  return true;
}

/**
 * Wires that need a node in between: one wide bus per row on one side,
 * narrower *panels* on the other, joined by a split (or merge) per row.
 *
 * The rows tile the panels as a picture: the panels form a grid `columns`
 * wide, row `r` of the wide side feeds row `r mod m` of the panels in grid
 * row `r div m`, and its lanes go left to right, most significant first —
 * the order a draw pad and a matrix both draw a row in. A 32-row, 32-bit pad
 * onto four 16 × 16 matrices is a 2 × 2 grid and 32 splits; one 16-bit bus
 * onto four 4-bit displays is a 1 × 4 grid and one split.
 */
export type Bridge = {
  kind: "split" | "merge";
  laneWidth: number;
  /** Per wide pin: its partners, most significant lane first. */
  rows: { wide: PinRef; lanes: PinRef[] }[];
  /** The narrow side's nodes, row-major, `columns` across. */
  panels: string[];
  columns: number;
};

export type BridgeResult =
  | { ok: true; bridge: Bridge }
  | { ok: false; reason: string }
  /** Both sides are the same width: no node is needed in between. */
  | { ok: false; reason: null };

export function planBridge(
  document: CircuitDocument,
  lookup: NodeLookup,
  a: readonly string[],
  b: readonly string[],
  kind: Bridge["kind"],
): BridgeResult {
  // Either side may be the one that drives, so both are tried. When neither
  // works, the reason worth reporting is the one from the way round where
  // both sides had pins at all.
  let fallback: BridgeResult = { ok: false, reason: NO_PINS };
  for (const [x, y] of [
    [a, b],
    [b, a],
  ]) {
    // A split takes wide outputs to narrow inputs; a merge narrow outputs to
    // a wide input. Either way `x` drives and `y` is driven.
    const result =
      kind === "split"
        ? tile(
            "split",
            outputs(document, lookup, x),
            inputsByNode(document, lookup, y),
          )
        : tile(
            "merge",
            inputs(document, lookup, y),
            outputsByNode(document, lookup, x),
          );
    if (result.ok || result.reason === null) return result;
    if (result.reason !== NO_PINS) fallback = result;
  }
  return fallback;
}

const NO_PINS = "One side has no free pins to wire.";

function tile(
  kind: Bridge["kind"],
  wide: readonly Endpoint[],
  panels: readonly Endpoint[][],
): BridgeResult {
  const nonEmpty = panels.filter((pins) => pins.length > 0);
  if (wide.length === 0 || nonEmpty.length === 0) {
    return { ok: false, reason: NO_PINS };
  }

  const width = wide[0].pin.width;
  const laneWidth = nonEmpty[0][0].pin.width;
  const perPanel = nonEmpty[0].length;
  if (
    wide.some((end) => end.pin.width !== width) ||
    nonEmpty.some(
      (pins) =>
        pins.length !== perPanel ||
        pins.some((end) => end.pin.width !== laneWidth),
    )
  ) {
    return {
      ok: false,
      reason: "The pins on each side are not all one width.",
    };
  }
  if (width === laneWidth) return { ok: false, reason: null };
  if (width < laneWidth || width % laneWidth !== 0) {
    return {
      ok: false,
      reason: `A ${width}-bit bus does not divide into ${laneWidth}-bit ${kind === "split" ? "outputs" : "inputs"}.`,
    };
  }

  const columns = width / laneWidth;
  const gridRows = nonEmpty.length / columns;
  if (!Number.isInteger(gridRows) || gridRows * perPanel !== wide.length) {
    return {
      ok: false,
      reason: `${wide.length} buses of ${width} bits don't tile ${nonEmpty.length} elements of ${perPanel} × ${laneWidth} bits: that needs ${(wide.length / perPanel) * columns} of them.`,
    };
  }

  const ref = (end: Endpoint): PinRef => ({
    nodeId: end.nodeId,
    pinId: end.pin.id,
  });
  return {
    ok: true,
    bridge: {
      kind,
      laneWidth,
      columns,
      panels: nonEmpty.map((pins) => pins[0].nodeId),
      rows: wide.map((end, row) => ({
        wide: ref(end),
        lanes: Array.from({ length: columns }, (_, column) =>
          ref(
            nonEmpty[Math.floor(row / perPanel) * columns + column][
              row % perPanel
            ],
          ),
        ),
      })),
    },
  };
}

function outputs(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeIds: readonly string[],
): Endpoint[] {
  return endpoints(document, lookup, nodeIds).filter(
    (end) => end.pin.direction !== "in",
  );
}

function inputs(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeIds: readonly string[],
): Endpoint[] {
  const driven = drivenPins(document);
  return endpoints(document, lookup, nodeIds).filter(
    (end) =>
      end.pin.direction !== "out" && !driven.has(key(end.nodeId, end.pin.id)),
  );
}

function outputsByNode(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeIds: readonly string[],
): Endpoint[][] {
  return nodeIds.map((id) => outputs(document, lookup, [id]));
}

function inputsByNode(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeIds: readonly string[],
): Endpoint[][] {
  return nodeIds.map((id) => inputs(document, lookup, [id]));
}
