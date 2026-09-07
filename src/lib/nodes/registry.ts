import type { NodeDefinition, NodeLookup } from "./define";
import { andGate } from "./gates/and";
import { bufferGate } from "./gates/buffer";
import { nandGate } from "./gates/nand";
import { norGate } from "./gates/nor";
import { notGate } from "./gates/not";
import { orGate } from "./gates/or";
import { tristateGate } from "./gates/tristate";
import { xnorGate } from "./gates/xnor";
import { xorGate } from "./gates/xor";
import { buttonNode } from "./io/button";
import { constantNode } from "./io/constant";
import { ledNode } from "./io/led";
import { probeNode } from "./io/probe";
import { switchNode } from "./io/switch";

/**
 * The node registry: every type the app knows about, in palette order.
 *
 * An explicit array, never a filesystem glob or import side effects — see
 * artifacts/05-node-authoring-guide.md. Adding a node means a file next to
 * these and one line here, and nothing else in the codebase changes.
 */
export const nodeDefinitions: readonly NodeDefinition[] = [
  andGate,
  orGate,
  nandGate,
  norGate,
  xorGate,
  xnorGate,
  notGate,
  bufferGate,
  tristateGate,
  switchNode,
  buttonNode,
  constantNode,
  ledNode,
  probeNode,
];

/**
 * Category ids and their labels, in the order the palette shows them.
 *
 * Labels live here rather than in the palette so a new family is still two
 * files: nothing in `src/components/` enumerates node types or categories.
 * A definition whose `category` is missing from this list is grouped under
 * "Other" rather than dropped.
 */
export const nodeCategories: readonly { id: string; label: string }[] = [
  { id: "gates", label: "Gates" },
  { id: "io", label: "Inputs & outputs" },
];

const byType = new Map(
  nodeDefinitions.map((definition) => [definition.type, definition]),
);

/** `NodeLookup` for the scene. Undefined for a type this build does not have. */
export const lookupNode: NodeLookup = (type) => byType.get(type);
