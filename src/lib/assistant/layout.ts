import { moveNodes } from "@/lib/circuit/commands";
import {
  GRID_SIZE,
  nodeBounds,
  pinOffsets,
  type Rect,
  rectsIntersect,
  rotateSize,
  snapToGrid,
} from "@/lib/circuit/geometry";
import {
  type CircuitDocument,
  isWireAnchor,
  type Point,
} from "@/lib/circuit/schema";
import type { NodeLookup } from "@/lib/nodes/define";

/**
 * Where the nodes one request placed end up.
 *
 * A request's nodes are laid out together, as columns in dataflow order —
 * whatever drives sits to the left of what it drives, however the request
 * happened to list them — centred on where the user is looking, and pushed
 * down past anything already there. Each node in a column is slid so its
 * first wire from the left runs level — a draw pad beside a matrix reads as
 * sixteen straight lines, and a column of splits sits one per row it cuts —
 * without two nodes in a column overlapping. A group that tiles (four
 * matrices showing one picture) is laid out as its grid and levelled whole.
 */

export type LayoutGroup = {
  ids: readonly string[];
  /** Lay the group out as a grid this many across, row-major, instead of a column. */
  columns?: number;
};

/** Room for the value a bus wire is labelled with, between the columns. */
const COLUMN_GAP = 16 * GRID_SIZE;
const ROW_GAP = 2 * GRID_SIZE;
/** Between nodes a column levels one by one: enough to see where one ends. */
const NODE_GAP = GRID_SIZE;
/** Side-by-side lanes a levelled column may spread into before it grows down. */
const MAX_LANES = 4;
const LANE_GAP = 2 * GRID_SIZE;
/** Clearance kept from existing parts. */
const MARGIN = 2 * GRID_SIZE;
/** Bounds the push-down; each pass clears at least one existing part. */
const MAX_PASSES = 64;

type Box = { id: string; x: number; y: number; width: number; height: number };

export function arrangePlaced(
  document: CircuitDocument,
  lookup: NodeLookup,
  groups: readonly LayoutGroup[],
  worldCenter: Point,
): CircuitDocument {
  const live = groups
    .map((group) => ({
      ...group,
      ids: group.ids.filter((id) => document.nodes[id]),
    }))
    .filter((group) => group.ids.length > 0);
  if (live.length === 0) return document;

  const order = dataflowOrder(
    document,
    live.map((group) => group.ids),
  );

  // Columns side by side, each centred on y = 0, then levelled on its wires.
  let cursorX = 0;
  const placed: Box[] = [];
  for (const index of order) {
    const group = live[index];
    const grid = group.columns !== undefined && group.columns > 1;
    const column = grid
      ? gridOf(document, lookup, group.ids, group.columns as number)
      : stackColumn(document, lookup, group.ids);

    if (grid || column.length === 1) {
      const dy = levelling(document, lookup, placed, column) ?? 0;
      for (const box of column) box.y += dy;
    } else {
      levelEach(document, lookup, placed, column);
    }

    // Measured after levelling, which may have spread the column sideways.
    const left = Math.min(...column.map((box) => box.x));
    const width = Math.max(...column.map((box) => box.x + box.width)) - left;
    for (const box of column) box.x += cursorX - left;
    cursorX += width + COLUMN_GAP;
    placed.push(...column);
  }

  const block = boundsOf(placed);
  const originX = snapToGrid(worldCenter.x - block.width / 2) - block.x;
  let originY = snapToGrid(worldCenter.y - block.height / 2) - block.y;

  const ours = new Set(placed.map((box) => box.id));
  const others = Object.values(document.nodes)
    .filter((node) => !ours.has(node.id))
    .map((node) => {
      const definition = lookup(node.type);
      const size = definition
        ? rotateSize(definition.size(node.params), node.rotation ?? 0)
        : { width: 1, height: 1 };
      return nodeBounds(node.position, size);
    });

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const area: Rect = {
      x: block.x + originX - MARGIN,
      y: block.y + originY - MARGIN,
      width: block.width + MARGIN * 2,
      height: block.height + MARGIN * 2,
    };
    const blocking = others.filter((rect) => rectsIntersect(rect, area));
    if (blocking.length === 0) break;

    const bottom = Math.max(...blocking.map((rect) => rect.y + rect.height));
    originY = snapToGrid(bottom + MARGIN * 2 - block.y);
  }

  let next = document;
  for (const box of placed) {
    const node = next.nodes[box.id];
    const target = {
      x: snapToGrid(box.x + originX),
      y: snapToGrid(box.y + originY),
    };
    next = moveNodes(next, [box.id], {
      x: target.x - node.position.x,
      y: target.y - node.position.y,
    });
  }
  return next;
}

/**
 * Group indices, drivers first. Kahn's algorithm, always taking the earliest
 * group that is ready so the request's own order breaks ties; a cycle is
 * broken the same way rather than dropped.
 */
function dataflowOrder(
  document: CircuitDocument,
  groups: readonly (readonly string[])[],
): number[] {
  const groupOf = new Map<string, number>();
  groups.forEach((ids, index) => {
    for (const id of ids) groupOf.set(id, index);
  });

  const after = groups.map(() => new Set<number>());
  const indegree = groups.map(() => 0);
  for (const wire of Object.values(document.wires)) {
    if (isWireAnchor(wire.from)) continue;
    const from = groupOf.get(wire.from.nodeId);
    const to = groupOf.get(wire.to.nodeId);
    if (from === undefined || to === undefined || from === to) continue;
    if (after[from].has(to)) continue;
    after[from].add(to);
    indegree[to]++;
  }

  const order: number[] = [];
  const done = new Set<number>();
  while (order.length < groups.length) {
    let next = groups.findIndex(
      (_, index) => !done.has(index) && indegree[index] === 0,
    );
    if (next === -1) next = groups.findIndex((_, index) => !done.has(index));

    done.add(next);
    order.push(next);
    for (const to of after[next]) indegree[to]--;
  }
  return order;
}

/** One group's nodes stacked top to bottom, centred on y = 0, left edge at x = 0. */
function stackColumn(
  document: CircuitDocument,
  lookup: NodeLookup,
  ids: readonly string[],
): Box[] {
  const boxes = ids.map((id) => {
    const node = document.nodes[id];
    const definition = lookup(node.type);
    const size = definition
      ? rotateSize(definition.size(node.params), node.rotation ?? 0)
      : { width: 1, height: 1 };
    return {
      id,
      x: 0,
      y: 0,
      width: size.width * GRID_SIZE,
      height: size.height * GRID_SIZE,
    };
  });

  let cursorY = 0;
  for (const box of boxes) {
    box.y = cursorY;
    cursorY += box.height + ROW_GAP;
  }
  const height = cursorY - ROW_GAP;
  for (const box of boxes) box.y -= snapToGrid(height / 2);

  return boxes;
}

/**
 * How far to slide `column` so the wires into it from earlier columns run
 * level, on average — the first wire exactly when every pitch agrees, as a
 * draw pad's rows and a matrix's do. Null when nothing wires into it.
 */
function levelling(
  document: CircuitDocument,
  lookup: NodeLookup,
  earlier: readonly Box[],
  column: readonly Box[],
): number | null {
  const before = new Map(earlier.map((box) => [box.id, box]));
  const here = new Map(column.map((box) => [box.id, box]));

  let total = 0;
  let count = 0;
  for (const wire of Object.values(document.wires)) {
    if (isWireAnchor(wire.from)) continue;
    const fromBox = before.get(wire.from.nodeId);
    const toBox = here.get(wire.to.nodeId);
    if (!fromBox || !toBox) continue;

    const fromY = pinY(document, lookup, wire.from.nodeId, wire.from.pinId);
    const toY = pinY(document, lookup, wire.to.nodeId, wire.to.pinId);
    if (fromY === null || toY === null) continue;

    total += fromBox.y + fromY - (toBox.y + toY);
    count++;
  }
  return count > 0 ? snapToGrid(total / count) : null;
}

/**
 * Levels each node of a column on its own wires. A node that would overlap
 * the one before it moves into the next of up to `MAX_LANES` side-by-side
 * lanes instead of down, so thirty-two splits still sit one per row of a
 * draw pad whose rows are closer together than a split is tall. Only when
 * every lane is taken is a node pushed down, into the lane that frees first.
 */
function levelEach(
  document: CircuitDocument,
  lookup: NodeLookup,
  earlier: readonly Box[],
  column: Box[],
): void {
  const width = Math.max(...column.map((box) => box.width));
  /** Where each lane is next free, top to bottom. */
  const free: number[] = [];
  let previous: Box | null = null;

  for (const box of column) {
    const dy = levelling(document, lookup, earlier, [box]);
    if (dy !== null) box.y += dy;
    else if (previous) box.y = previous.y + previous.height + NODE_GAP;

    let lane = free.findIndex((bottom) => bottom <= box.y);
    if (lane === -1 && free.length < MAX_LANES) lane = free.length;
    if (lane === -1) {
      lane = free.indexOf(Math.min(...free));
      box.y = snapToGrid(free[lane]);
    }
    box.x = lane * (width + LANE_GAP);
    free[lane] = box.y + box.height + NODE_GAP;
    previous = box;
  }
}

/** A group as a grid `columns` across, row-major, centred on y = 0. */
function gridOf(
  document: CircuitDocument,
  lookup: NodeLookup,
  ids: readonly string[],
  columns: number,
): Box[] {
  const boxes = stackColumn(document, lookup, ids);
  // Across, a full column gap: a panel's pins face the one beside it, and
  // its wires need room to land.
  const cellWidth = Math.max(...boxes.map((box) => box.width)) + COLUMN_GAP;
  const cellHeight = Math.max(...boxes.map((box) => box.height)) + ROW_GAP;
  const rows = Math.ceil(boxes.length / columns);
  boxes.forEach((box, index) => {
    box.x = (index % columns) * cellWidth;
    box.y =
      Math.floor(index / columns) * cellHeight -
      snapToGrid((rows * cellHeight - ROW_GAP) / 2);
  });
  return boxes;
}

/** A pin's height below its node's top edge, in world units. */
function pinY(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeId: string,
  pinId: string,
): number | null {
  const node = document.nodes[nodeId];
  const definition = node && lookup(node.type);
  if (!definition) return null;

  const offsets = pinOffsets(
    definition.pins(node.params),
    definition.size(node.params),
    node.rotation ?? 0,
  );
  return offsets.find((offset) => offset.spec.id === pinId)?.dy ?? null;
}

function boundsOf(boxes: readonly Box[]): Rect {
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  const maxX = Math.max(...boxes.map((box) => box.x + box.width));
  const maxY = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
