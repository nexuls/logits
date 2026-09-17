import { type NodeLookup, pinSpecsFor } from "@/lib/nodes/define";
import { boundsOf, type Selection, topLeftForCenter } from "./commands";
import {
  GRID_SIZE,
  pinOffsets,
  rectContains,
  rotateSize,
  snapToGrid,
} from "./geometry";
import { createDocumentId, createNodeId, createWireId } from "./ids";
import { buildNetlist, pinKey } from "./netlist";
import {
  type CircuitDocument,
  type CircuitNode,
  isWireAnchor,
  type PinRef,
  type Point,
  type Wire,
  type WireEnd,
} from "./schema";
import {
  SUBCIRCUIT_TYPE_PREFIX,
  subcircuitLookup,
  subcircuitPorts,
  subcircuitType,
} from "./subcircuit";

/**
 * Editing the chip library: turning a selection into a chip, and everything
 * the editor needs in order to manage one afterwards.
 *
 * Pure, like `./commands.ts`, and separate from it because `./subcircuit.ts` is
 * the *model* half — the lookup and the flattening, both of which the netlist
 * depends on. Nothing here is reachable from `buildNetlist`, so the engine's
 * dependency graph does not grow an editor command.
 *
 * Two rules hold throughout, on top of the two in `./commands.ts`:
 *
 * 1. **The library is flat and lives on the root document.** A chip may
 *    instantiate another chip, but every chip is defined once in the root's
 *    `subcircuits` — see ADR 0010. Nothing here nests one inside another.
 * 2. **A chip's key is in the save format.** It is derived from the name once,
 *    at creation, and never rewritten; renaming a chip changes its `name` and
 *    leaves `sub.<key>`, and so every instance, alone.
 */

/** Gap between the chip body and a port column, in world units. */
const PORT_GAP = 4 * GRID_SIZE;
/** A `sub.port`'s own footprint, from its definition: 6 × 4 cells. */
const PORT_SIZE = { width: 6 * GRID_SIZE, height: 4 * GRID_SIZE };
/** Where a port's `io` pin sits down its side — `offset: 2` in grid cells. */
const PORT_PIN_DY = 2 * GRID_SIZE;
/** Least vertical distance between two ports in the same column. */
const PORT_PITCH = PORT_SIZE.height + 2 * GRID_SIZE;

/**
 * The end of a crossing wire that ended up inside the chip, and so needs a
 * port to stand for it.
 *
 * A `WireEnd` rather than a `PinRef` because a branch tapping a wire that went
 * in crosses the boundary too, and a tap has no pin to name: the port joins
 * the *wire* instead, exactly as the branch did before.
 */
type Boundary = {
  /** What the port replaces, in the chip's own document. */
  inside: WireEnd;
  /** The pin at the other end, in the parent. Null when that end is a tap. */
  outside: PinRef | null;
};

export type SubcircuitPort = {
  name: string;
  /** From the chip's point of view: `"in"` is driven by the parent. */
  direction: "in" | "out";
  width: number;
};

export type CreateSubcircuitResult = {
  document: CircuitDocument;
  /** Index into `document.subcircuits`; `sub.<key>` is the instance's type. */
  key: string;
  /** The instance that replaced the selection, in the parent. */
  instanceId: string;
  /** The interface the selection's crossing wires produced. */
  ports: SubcircuitPort[];
};

/**
 * Lifts a selection out of a document and puts it back as one chip instance.
 *
 * The selected nodes and the wires *between* them move into a new chip. Every
 * wire that crossed the selection's boundary stays in the parent and is
 * re-pointed at a pin on the instance, with a `sub.port` inside the chip
 * standing for the end that went in. That is what makes the circuit run
 * exactly as it did before: a port is a join, so it adds no delay and no net.
 *
 * Node and wire ids are *kept* on the way in rather than regenerated. A
 * branch's anchor names a wire id and a waypoint index, and both have to go on
 * meaning what they meant; the chip is a separate document, so there is
 * nothing for the old ids to collide with.
 *
 * Null when the selection contains no nodes — there is no chip to make.
 */
export function createSubcircuit(
  document: CircuitDocument,
  lookup: NodeLookup,
  selection: Selection,
  options: { name: string; key?: string },
): CreateSubcircuitResult | null {
  const inside = new Set(
    (selection.nodeIds ?? []).filter((id) => id in document.nodes),
  );
  if (inside.size === 0) return null;

  const name = options.name.trim() || "Chip";
  const key = options.key ?? nextSubcircuitKey(document, lookup, name);
  const instanceId = createNodeId();

  const bounds = boundsOf(document, lookup, [...inside]) ?? {
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  };
  const { internal, crossing } = partitionWires(document, inside);

  // Where the selection lands inside the chip: far enough right of the origin
  // to leave the input port column a gutter of its own.
  const shift: Point = {
    x: snapToGrid(PORT_SIZE.width + PORT_GAP - bounds.x),
    y: snapToGrid(-bounds.y),
  };
  const shifted = (point: Point): Point => ({
    x: point.x + shift.x,
    y: point.y + shift.y,
  });

  const chipNodes: Record<string, CircuitNode> = {};
  for (const nodeId of [...inside].sort()) {
    const node = document.nodes[nodeId];
    chipNodes[nodeId] = {
      ...node,
      position: shifted(node.position),
      // Params are JSON, so a shallow copy would share a nested value with the
      // node that used to be in the parent.
      params: structuredClone(node.params),
    };
  }

  const chipWires: Record<string, Wire> = {};
  for (const wireId of [...internal].sort()) {
    const wire = document.wires[wireId];
    chipWires[wireId] = {
      ...wire,
      ...(wire.waypoints ? { waypoints: wire.waypoints.map(shifted) } : {}),
    };
  }

  const boundaries = boundaryGroups(document, lookup, inside, crossing);

  // Seeded with the ports the selection *already* contains: a chip may be made
  // out of a circuit that was itself built with ports in it, and a generated
  // port that took one of their names would collide with it — two ports with
  // one name being a pin that claims to be two (`subcircuitPorts`).
  const taken = new Set(
    subcircuitPorts(
      { version: document.version, id: key, name, nodes: chipNodes, wires: {} },
      lookup,
    ).map((port) => port.name),
  );
  const ports: SubcircuitPort[] = [];
  /** Which pin of the instance each crossing wire now lands on. */
  const pinFor = new Map<string, string>();
  const pending: {
    port: SubcircuitPort;
    nodeId: string;
    /** Where the boundary sits vertically, so the port can aim at it. */
    y: number;
    inside: readonly WireEnd[];
  }[] = [];

  for (const group of boundaries) {
    const described = describeGroup(document, lookup, group);
    const port: SubcircuitPort = {
      name: uniqueName(taken, described.name, described.direction),
      direction: described.direction,
      width: described.width,
    };
    taken.add(port.name);
    ports.push(port);
    for (const wireId of group.wireIds) pinFor.set(wireId, port.name);

    pending.push({
      port,
      nodeId: createNodeId(),
      y: described.y + shift.y,
      inside: group.inside,
    });
  }

  // Two columns — inputs left of the body, outputs right of it — each port
  // aimed at the pin it feeds and then pushed down where two would overlap, so
  // a chip opens as a readable schematic rather than a pile at the origin.
  const bodyRight = shift.x + bounds.x + bounds.width + PORT_GAP;

  for (const side of ["in", "out"] as const) {
    const column = pending
      .filter((entry) => entry.port.direction === side)
      .sort((a, b) => a.y - b.y || a.port.name.localeCompare(b.port.name));

    let floor = -Infinity;
    for (const entry of column) {
      const y = Math.max(snapToGrid(entry.y - PORT_PIN_DY), floor);
      floor = y + PORT_PITCH;

      chipNodes[entry.nodeId] = {
        id: entry.nodeId,
        type: PORT_TYPE,
        position: { x: side === "in" ? 0 : bodyRight, y },
        params: {
          name: entry.port.name,
          direction: side,
          width: entry.port.width,
        },
      };

      // One wire per inside end, not one per port: two gates that were fed by
      // the same switch outside are no longer joined to each other once that
      // switch is on the other side of the boundary, so the port has to reach
      // both of them for the net to come out the same shape it went in.
      //
      // `Wire.from` is the driver wherever one is unambiguous, which is the
      // rule the wiring gestures follow: an input port is the source inside
      // the chip, an output port the sink. A tap can only ever be a `from`, so
      // a boundary on one is stored that way round whatever it means.
      const portPin: PinRef = { nodeId: entry.nodeId, pinId: PORT_PIN_ID };
      for (const end of entry.inside) {
        const wireId = createWireId();
        chipWires[wireId] =
          side === "in" && !isWireAnchor(end)
            ? { id: wireId, from: portPin, to: end }
            : { id: wireId, from: end, to: portPin };
      }
    }
  }

  const chip: CircuitDocument = {
    // The parent's version, not `CURRENT_VERSION`: a chip is a document nested
    // in this one and migrates with it.
    version: document.version,
    id: createDocumentId(),
    name,
    nodes: chipNodes,
    wires: chipWires,
  };

  // The parent: the selection gone, one instance in its place, and every
  // crossing wire re-pointed at the pin that now stands for what it reached.
  const parentNodes: Record<string, CircuitNode> = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    if (!inside.has(id)) parentNodes[id] = node;
  }

  const library = { ...(document.subcircuits ?? {}), [key]: chip };
  const instanceType = subcircuitType(key);
  // Through the lookup rather than by guessing a footprint, so the instance is
  // centred on what it replaced using the size the canvas will draw it at.
  const definition = subcircuitLookup(
    { ...document, subcircuits: library },
    lookup,
  )(instanceType);
  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  parentNodes[instanceId] = {
    id: instanceId,
    type: instanceType,
    position: snapPoint(
      definition ? topLeftForCenter(definition, {}, 0, center) : center,
    ),
    params: {},
  };

  const anchored = new Set<string>();
  for (const wire of Object.values(document.wires)) {
    if (isWireAnchor(wire.from)) anchored.add(wire.from.wireId);
  }

  const parentWires: Record<string, Wire> = {};
  for (const [id, wire] of Object.entries(document.wires)) {
    if (internal.has(id)) continue;

    const pinId = pinFor.get(id);
    if (pinId === undefined) {
      parentWires[id] = wire;
      continue;
    }

    const instancePin: PinRef = { nodeId: instanceId, pinId };
    parentWires[id] = {
      ...wire,
      ...(inside.has(wire.to.nodeId)
        ? { to: instancePin }
        : { from: instancePin }),
      // Bends left stranded where the circuit used to be are dropped — but
      // only on a wire nothing taps, since an anchor names a waypoint by
      // index and re-indexing would move somebody else's branch.
      ...(wire.waypoints && !anchored.has(id)
        ? {
            waypoints: wire.waypoints.filter(
              (point) => !rectContains(bounds, point),
            ),
          }
        : {}),
    };
  }

  return {
    document: {
      ...document,
      nodes: parentNodes,
      wires: parentWires,
      subcircuits: library,
    },
    key,
    instanceId,
    ports,
  };
}

/**
 * `sub.port` and its one pin, named here because this module builds ports
 * without going through the palette. They are in the save format either way —
 * see Non-negotiable #10 — so naming them is not a second source of truth.
 */
const PORT_TYPE = "sub.port";
const PORT_PIN_ID = "io";

function snapPoint(point: Point): Point {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

/**
 * Which wires go into the chip whole, and which straddle its boundary.
 *
 * A wire is inside when *both* its ends are, and a tap counts as being
 * wherever the wire it taps ended up — memoised, since a branch off a branch
 * has to follow the chain down to a wire that ends on pins.
 */
function partitionWires(
  document: CircuitDocument,
  inside: ReadonlySet<string>,
): { internal: Set<string>; crossing: Set<string> } {
  const internal = new Set<string>();
  const crossing = new Set<string>();
  const memo = new Map<string, boolean>();

  const fromInside = (wire: Wire, seen: Set<string>): boolean => {
    if (!isWireAnchor(wire.from)) return inside.has(wire.from.nodeId);

    const target = document.wires[wire.from.wireId];
    // A tap on a wire that is not there, or a cycle a hand-written file could
    // contain: outside, so the wire stays in the parent and is left alone.
    if (!target || seen.has(target.id)) return false;
    seen.add(target.id);
    return wireInside(target, seen);
  };

  const wireInside = (wire: Wire, seen: Set<string>): boolean => {
    const cached = memo.get(wire.id);
    if (cached !== undefined) return cached;

    const result = fromInside(wire, seen) && inside.has(wire.to.nodeId);
    memo.set(wire.id, result);
    return result;
  };

  for (const wire of Object.values(document.wires)) {
    const from = fromInside(wire, new Set([wire.id]));
    const to = inside.has(wire.to.nodeId);
    if (from && to) internal.add(wire.id);
    else if (from || to) crossing.add(wire.id);
  }

  return { internal, crossing };
}

/** A crossing wire's two ends, sorted into the one that went in and the one that stayed. */
function boundaryOf(
  document: CircuitDocument,
  inside: ReadonlySet<string>,
  wire: Wire,
): Boundary | null {
  if (inside.has(wire.to.nodeId)) {
    return {
      inside: wire.to,
      outside: isWireAnchor(wire.from) ? null : wire.from,
    };
  }

  // The other way round: `from` went in, so the pin left outside is `to`.
  if (isWireAnchor(wire.from) && !document.wires[wire.from.wireId]) return null;
  return { inside: wire.from, outside: wire.to };
}

/** One pin on the instance: every crossing wire that was on the same net. */
type BoundaryGroup = {
  /** Distinct ends inside the chip that the port has to reach. */
  inside: WireEnd[];
  /** Pins left in the parent, for naming and for reading the direction off. */
  outside: PinRef[];
  wireIds: string[];
};

/**
 * The chip's boundary, one entry per pin the instance will have.
 *
 * Grouped by **net**, not by pin. Two wires from one switch into two different
 * gates are one signal, so they are one pin — and the port inside then fans
 * out to both gates, exactly as the switch did. Grouping by the inside pin
 * would give that switch two pins on the instance and quietly split a net in
 * two; grouping by the outside pin would split one inside output feeding two
 * outside readers the same way.
 *
 * The nets come from `buildNetlist`, so "same net" here means what it means
 * everywhere else, tunnels and taps included.
 */
function boundaryGroups(
  document: CircuitDocument,
  lookup: NodeLookup,
  inside: ReadonlySet<string>,
  crossing: ReadonlySet<string>,
): BoundaryGroup[] {
  const { pinToNet } = buildNetlist(document, lookup);
  const groups = new Map<string, BoundaryGroup>();

  for (const wireId of [...crossing].sort()) {
    const wire = document.wires[wireId];
    const boundary = boundaryOf(document, inside, wire);
    if (!boundary) continue;

    // `to` is always a pin, and a wire's two ends are one net, so this is the
    // net of the whole crossing whichever end went in. A pin the definition no
    // longer has falls back to the inside end's own identity, which is the
    // grouping this had before nets came into it.
    const net = pinToNet[pinKey(wire.to.nodeId, wire.to.pinId)];
    const id = net === undefined ? endKey(boundary.inside) : `net:${net}`;

    const group = groups.get(id) ?? { inside: [], outside: [], wireIds: [] };
    group.wireIds.push(wireId);
    if (!group.inside.some((end) => endKey(end) === endKey(boundary.inside))) {
      group.inside.push(boundary.inside);
    }
    if (
      boundary.outside &&
      !group.outside.some(
        (pin) => pinKey(pin.nodeId, pin.pinId) === endKey(boundary.outside),
      )
    ) {
      group.outside.push(boundary.outside);
    }
    groups.set(id, group);
  }

  return [...groups.values()];
}

/** A stable map key for a wire end, so two wires on one pin share a port. */
function endKey(end: WireEnd | null): string {
  if (!end) return "";
  return isWireAnchor(end)
    ? `${end.wireId} #${end.waypoint}`
    : pinKey(end.nodeId, end.pinId);
}

/**
 * What the port standing for a boundary should be: its direction from the
 * chip's point of view, its width, a name to start from, and where inside the
 * selection it wants to sit.
 *
 * Direction comes from the inside pins wherever they commit to one: an inside
 * output means the chip drives this signal. `inout` pins, and a tap — which
 * has no pin at all — fall back to the ends left outside, read the other way
 * round: something the *parent* drives is an input to the chip.
 */
function describeGroup(
  document: CircuitDocument,
  lookup: NodeLookup,
  group: BoundaryGroup,
): { direction: "in" | "out"; width: number; name: string; y: number } {
  const insidePins = group.inside
    .map((end) => (isWireAnchor(end) ? null : resolvePin(document, lookup, end)))
    .filter((pin) => pin !== null);
  const outsidePins = group.outside
    .map((ref) => resolvePin(document, lookup, ref))
    .filter((pin) => pin !== null);

  const direction = insidePins.some((pin) => pin.spec.direction === "out")
    ? "out"
    : insidePins.some((pin) => pin.spec.direction === "in")
      ? "in"
      : outsidePins.some((pin) => pin.spec.direction === "out")
        ? "in"
        : "out";

  // The label on the part at the far end is the best name a port can inherit
  // — it is what the user already calls this signal — and it is only taken
  // when there is one part out there to name it after. Then the inside part's
  // label, then the pin names, which are all a gate has.
  const outsideLabel =
    outsidePins.length === 1 ? (outsidePins[0].node.label ?? "").trim() : "";
  const insideLabel = (insidePins[0]?.node.label ?? "").trim();
  const name =
    outsideLabel ||
    insideLabel ||
    insidePins[0]?.spec.name ||
    outsidePins[0]?.spec.name ||
    "";

  const first = group.inside[0];
  return {
    direction,
    width: insidePins[0]?.spec.width ?? outsidePins[0]?.spec.width ?? 1,
    name,
    y:
      first && isWireAnchor(first)
        ? (tapPoint(document, first)?.y ?? outsidePins[0]?.y ?? 0)
        : (insidePins[0]?.y ?? 0),
  };
}

/** Where a tap sits: the bend on the wire it names. */
function tapPoint(
  document: CircuitDocument,
  end: Extract<WireEnd, { wireId: string }>,
): Point | undefined {
  return document.wires[end.wireId]?.waypoints?.[end.waypoint];
}

/** A wire end's pin spec, its node, and where that pin sits in world space. */
function resolvePin(
  document: CircuitDocument,
  lookup: NodeLookup,
  ref: PinRef,
) {
  const node = document.nodes[ref.nodeId];
  if (!node) return null;

  const specs = pinSpecsFor(node, lookup);
  const spec = specs.find((candidate) => candidate.id === ref.pinId);
  if (!spec) return null;

  const definition = lookup(node.type);
  if (!definition) return { node, spec, y: node.position.y };

  const rotation = node.rotation ?? 0;
  const size = rotateSize(definition.size(node.params), rotation);
  const offset = pinOffsets(specs, size, rotation).find(
    (candidate) => candidate.spec.id === ref.pinId,
  );

  return { node, spec, y: node.position.y + (offset?.dy ?? 0) };
}

/**
 * A port name no other port on this chip has. Pin ids on the instance *are*
 * the port names, so two ports called the same thing would be one pin.
 */
function uniqueName(
  taken: ReadonlySet<string>,
  name: string,
  direction: "in" | "out",
): string {
  const base = name.trim().slice(0, 30) || (direction === "in" ? "IN" : "OUT");
  if (!taken.has(base)) return base;

  for (let n = 2; ; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A key for a new chip, derived from its name.
 *
 * Readable rather than opaque, because it is what `sub.<key>` is made of and
 * so what an exported or hand-edited file shows. It is checked against the
 * registry as well as against the library: a chip keyed `port` would be
 * shadowed by `sub.port`, since the lookup answers from the registry first.
 */
export function nextSubcircuitKey(
  document: CircuitDocument,
  lookup: NodeLookup,
  name: string,
): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "chip";

  const library = document.subcircuits ?? {};
  const free = (key: string) =>
    !(key in library) && lookup(subcircuitType(key)) === undefined;

  if (free(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (free(candidate)) return candidate;
  }
}

/** Replaces one chip's definition — how an edit made inside a chip is written back. */
export function putSubcircuit(
  document: CircuitDocument,
  key: string,
  definition: CircuitDocument,
): CircuitDocument {
  if (document.subcircuits?.[key] === definition) return document;

  return {
    ...document,
    subcircuits: { ...(document.subcircuits ?? {}), [key]: definition },
  };
}

/**
 * Follows a port's rename through to the wires landed on it.
 *
 * A port's name is the pin's **id** on every instance of its chip, and that id
 * is what a wire stores. Renaming the port therefore moves the pin out from
 * under every wire already on it, which used to leave them referencing a pin
 * that no longer exists — an `unknown-pin` error the user had to repair by
 * hand, in a document they were not even looking at.
 *
 * Renaming a pin is not a request to disconnect anything, so the wires come
 * along. Every instance in the project is covered, in the root circuit and in
 * every other chip, which is why this takes the root and not the open
 * document.
 */
export function renameSubcircuitPort(
  document: CircuitDocument,
  key: string,
  from: string,
  to: string,
): CircuitDocument {
  if (from === to || from.length === 0 || to.length === 0) return document;

  return everyInstance(document, key, (target, instances) =>
    movePinRefs(target, instances, from, to),
  );
}

/**
 * Removes the wires landed on a port's pin, because the port is going.
 *
 * Deleting a port, or clearing its name, takes the pin off every instance —
 * and unlike a rename there is nowhere for the wires on it to go. Leaving them
 * would put a dangling wire in the document, which `deleteElements` is
 * explicit about never being something an edit should create: it is a
 * load-time repair case. So they go the way a node's own wires go when the
 * node does, branches off them included.
 */
export function dropSubcircuitPort(
  document: CircuitDocument,
  key: string,
  name: string,
): CircuitDocument {
  if (name.length === 0) return document;

  return everyInstance(document, key, (target, instances) => {
    const onPin = Object.values(target.wires)
      .filter(
        (wire) =>
          (!isWireAnchor(wire.from) &&
            instances.has(wire.from.nodeId) &&
            wire.from.pinId === name) ||
          (instances.has(wire.to.nodeId) && wire.to.pinId === name),
      )
      .map((wire) => wire.id);

    return onPin.length === 0 ? target : deleteWires(target, onPin);
  });
}

/**
 * Applies `change` to the root and to every chip, wherever that circuit holds
 * instances of `key`. Unchanged documents are returned by reference, so a
 * project with one instance costs one new object.
 */
function everyInstance(
  document: CircuitDocument,
  key: string,
  change: (
    target: CircuitDocument,
    instances: ReadonlySet<string>,
  ) => CircuitDocument,
): CircuitDocument {
  const type = subcircuitType(key);

  const visit = (target: CircuitDocument): CircuitDocument => {
    const instances = new Set(
      Object.keys(target.nodes).filter((id) => target.nodes[id].type === type),
    );
    return instances.size === 0 ? target : change(target, instances);
  };

  const root = visit(document);

  const library: Record<string, CircuitDocument> = {};
  let libraryChanged = false;
  for (const [candidate, chip] of Object.entries(document.subcircuits ?? {})) {
    const next = visit(chip);
    library[candidate] = next;
    if (next !== chip) libraryChanged = true;
  }

  return libraryChanged ? { ...root, subcircuits: library } : root;
}

/** Re-points every end on `from` to `to`, for the given instances. */
function movePinRefs(
  target: CircuitDocument,
  instances: ReadonlySet<string>,
  from: string,
  to: string,
): CircuitDocument {
  const wires: Record<string, Wire> = { ...target.wires };
  let changed = false;

  for (const [id, wire] of Object.entries(target.wires)) {
    // An anchored end names a wire rather than a pin, so it cannot be on this
    // one.
    const moveFrom =
      !isWireAnchor(wire.from) &&
      instances.has(wire.from.nodeId) &&
      wire.from.pinId === from;
    const moveTo = instances.has(wire.to.nodeId) && wire.to.pinId === from;
    if (!moveFrom && !moveTo) continue;

    wires[id] = {
      ...wire,
      ...(moveFrom ? { from: { ...(wire.from as PinRef), pinId: to } } : {}),
      ...(moveTo ? { to: { ...wire.to, pinId: to } } : {}),
    };
    changed = true;
  }

  return changed ? { ...target, wires } : target;
}

/** Renames a chip. The key, and so every instance's `type`, is untouched. */
export function renameSubcircuit(
  document: CircuitDocument,
  key: string,
  name: string,
): CircuitDocument {
  const chip = document.subcircuits?.[key];
  const trimmed = name.trim();
  if (!chip || trimmed.length === 0 || chip.name === trimmed) return document;

  return putSubcircuit(document, key, { ...chip, name: trimmed });
}

/**
 * Deletes a chip, and every instance of it anywhere in the document.
 *
 * Leaving the instances behind would leave nodes whose type nothing resolves —
 * drawn as placeholders, reported as `unknown-node-type` — so they go with it,
 * their wires included, in one step. Instances inside *other* chips go too,
 * which is why this walks the whole library and not just the root's nodes.
 */
export function removeSubcircuit(
  document: CircuitDocument,
  key: string,
): CircuitDocument {
  if (!document.subcircuits?.[key]) return document;

  const type = subcircuitType(key);
  const strip = (target: CircuitDocument): CircuitDocument => {
    const nodeIds = Object.keys(target.nodes).filter(
      (id) => target.nodes[id].type === type,
    );
    return nodeIds.length === 0 ? target : deleteNodes(target, nodeIds);
  };

  const library: Record<string, CircuitDocument> = {};
  for (const [candidate, chip] of Object.entries(document.subcircuits)) {
    if (candidate !== key) library[candidate] = strip(chip);
  }

  const next = strip(document);
  if (Object.keys(library).length > 0) {
    return { ...next, subcircuits: library };
  }

  // An empty library is left off the document rather than written as `{}`:
  // that is how a circuit with no chips has always been shaped.
  const { subcircuits: _dropped, ...rest } = next;
  return rest;
}

/**
 * Wires, and the branches that tap them, gone.
 *
 * The cascade is what `deleteElements` does for a selected wire: a tap with
 * nothing left to tap has no position at all, so there is nothing to leave
 * behind for the user to reattach.
 */
function deleteWires(
  document: CircuitDocument,
  wireIds: readonly string[],
): CircuitDocument {
  const dropped = new Set(wireIds);

  for (let added = true; added; ) {
    added = false;
    for (const wire of Object.values(document.wires)) {
      if (dropped.has(wire.id)) continue;
      if (isWireAnchor(wire.from) && dropped.has(wire.from.wireId)) {
        dropped.add(wire.id);
        added = true;
      }
    }
  }

  const wires: Record<string, Wire> = {};
  for (const [id, wire] of Object.entries(document.wires)) {
    if (!dropped.has(id)) wires[id] = wire;
  }

  return { ...document, wires };
}

/**
 * Nodes and their wires, gone.
 *
 * What `deleteElements` does for a selection, done again here because this has
 * to run over a chip's document as well as the open one, and a chip has no
 * selection — importing the editor's notion of one to delete out of a nested
 * document would be the wrong shape.
 */
function deleteNodes(
  document: CircuitDocument,
  nodeIds: readonly string[],
): CircuitDocument {
  const dropped = new Set(nodeIds);
  const wireIds = new Set<string>();

  for (const wire of Object.values(document.wires)) {
    const from = isWireAnchor(wire.from) ? null : wire.from.nodeId;
    if ((from && dropped.has(from)) || dropped.has(wire.to.nodeId)) {
      wireIds.add(wire.id);
    }
  }

  // Branches off a deleted wire, and branches off those.
  for (let added = true; added; ) {
    added = false;
    for (const wire of Object.values(document.wires)) {
      if (wireIds.has(wire.id)) continue;
      if (isWireAnchor(wire.from) && wireIds.has(wire.from.wireId)) {
        wireIds.add(wire.id);
        added = true;
      }
    }
  }

  const nodes: Record<string, CircuitNode> = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    if (!dropped.has(id)) nodes[id] = node;
  }
  const wires: Record<string, Wire> = {};
  for (const [id, wire] of Object.entries(document.wires)) {
    if (!wireIds.has(id)) wires[id] = wire;
  }

  return { ...document, nodes, wires };
}

export type SubcircuitUsage = {
  /** The chip the instance sits in, or null for the root circuit. */
  ownerKey: string | null;
  nodeId: string;
};

/** Every instance of a chip, in the root circuit and in every other chip. */
export function subcircuitUsage(
  document: CircuitDocument,
  key: string,
): SubcircuitUsage[] {
  const type = subcircuitType(key);
  const usage: SubcircuitUsage[] = [];

  const scan = (target: CircuitDocument, ownerKey: string | null) => {
    for (const nodeId of Object.keys(target.nodes).sort()) {
      if (target.nodes[nodeId].type === type) usage.push({ ownerKey, nodeId });
    }
  };

  scan(document, null);
  for (const [ownerKey, chip] of Object.entries(
    document.subcircuits ?? {},
  ).sort(([a], [b]) => a.localeCompare(b))) {
    scan(chip, ownerKey);
  }

  return usage;
}

/**
 * May a chip keyed `key` be placed inside the circuit keyed `hostKey` — null
 * being the root?
 *
 * No, when that would make a chip contain itself, directly or through another
 * chip. `flattenDocument` already refuses to inline deeper than
 * `MAX_SUBCIRCUIT_DEPTH` and reports `subcircuit-recursion`, but a diagnostic
 * is the wrong answer to a placement that could only ever be a mistake: the
 * palette leaves it out instead.
 */
export function canInstantiate(
  document: CircuitDocument,
  hostKey: string | null,
  key: string,
): boolean {
  if (hostKey === null) return true;
  if (hostKey === key) return false;

  // Does `key`'s body reach `hostKey`? If it does, putting it inside `hostKey`
  // closes the loop.
  const library = document.subcircuits ?? {};
  const seen = new Set<string>();

  const reaches = (candidate: string): boolean => {
    if (candidate === hostKey) return true;
    if (seen.has(candidate)) return false;
    seen.add(candidate);

    const chip = library[candidate];
    if (!chip) return false;

    for (const node of Object.values(chip.nodes)) {
      const nested = instantiatedKey(node.type);
      if (nested !== null && reaches(nested)) return true;
    }
    return false;
  };

  return !reaches(key);
}

/**
 * The chip key a `sub.<key>` type names, or null.
 *
 * Read off the type rather than asked of the definition — which is what
 * `NodeDefinition.subcircuit` is for — because this walks chips that are not
 * the open document and have no lookup of their own. It is the same string the
 * lookup synthesizes from, and the prefix is part of the save format either
 * way.
 */
function instantiatedKey(type: string): string | null {
  return type.startsWith(SUBCIRCUIT_TYPE_PREFIX)
    ? type.slice(SUBCIRCUIT_TYPE_PREFIX.length)
    : null;
}

/** A chip's interface, as its instances present it. */
export function subcircuitInterface(
  document: CircuitDocument,
  lookup: NodeLookup,
  key: string,
): SubcircuitPort[] {
  const chip = document.subcircuits?.[key];
  if (!chip) return [];

  return subcircuitPorts(chip, lookup).map((port) => ({
    name: port.name,
    direction: port.direction,
    width: port.width,
  }));
}

/**
 * What `createSubcircuit` would make of this selection, without making it —
 * how many parts would move, and how many pins the instance would have. It is
 * what the create prompt says before the user commits to it.
 */
export function subcircuitPreview(
  document: CircuitDocument,
  lookup: NodeLookup,
  selection: Selection,
): { nodes: number; ports: number } {
  const inside = new Set(
    (selection.nodeIds ?? []).filter((id) => id in document.nodes),
  );
  if (inside.size === 0) return { nodes: 0, ports: 0 };

  const { crossing } = partitionWires(document, inside);
  return {
    nodes: inside.size,
    ports: boundaryGroups(document, lookup, inside, crossing).length,
  };
}
