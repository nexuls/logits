import { mergeNode } from "./bus/merge";
import { splitNode } from "./bus/split";
import { tunnelNode } from "./bus/tunnel";
import { adderNode } from "./comb/adder";
import { aluNode } from "./comb/alu";
import { comparatorNode } from "./comb/comparator";
import { decoderNode } from "./comb/decoder";
import { demuxNode } from "./comb/demux";
import { encoderNode } from "./comb/encoder";
import { muxNode } from "./comb/mux";
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
import { bargraphNode } from "./instruments/bargraph";
import { hexDisplayNode } from "./instruments/hex";
import { scopeNode } from "./instruments/scope";
import { sevenSegmentNode } from "./instruments/sevenseg";
import { buttonNode } from "./io/button";
import { constantNode } from "./io/constant";
import { ledNode } from "./io/led";
import { probeNode } from "./io/probe";
import { switchNode } from "./io/switch";
import { ramNode } from "./mem/ram";
import { romNode } from "./mem/rom";
import { counterNode } from "./seq/counter";
import { dFlipFlop } from "./seq/dff";
import { jkFlipFlop } from "./seq/jkff";
import { latchNode } from "./seq/latch";
import { registerNode } from "./seq/register";
import { tFlipFlop } from "./seq/tff";
import { portNode } from "./sub/port";
import { clockNode } from "./timing/clock";
import { delayNode } from "./timing/delay";
import { oneshotNode } from "./timing/oneshot";

/**
 * The node registry: every type the app knows about, in palette order.
 *
 * An explicit array, never a filesystem glob or import side effects — see
 * artifacts/05-node-authoring-guide.md. Adding a node means a file next to
 * these and one line here, and nothing else in the codebase changes.
 *
 * User-defined chips are deliberately *not* here: they are derived from the
 * open document rather than built into the app, and reach the scene through
 * `subcircuitLookup` in `src/lib/circuit/subcircuit.ts`.
 */
export const nodeDefinitions: readonly NodeDefinition[] = [
  andGate,
  orGate,
  notGate,
  nandGate,
  norGate,
  xorGate,
  xnorGate,
  bufferGate,
  tristateGate,
  switchNode,
  buttonNode,
  constantNode,
  ledNode,
  probeNode,
  clockNode,
  oneshotNode,
  delayNode,
  dFlipFlop,
  jkFlipFlop,
  tFlipFlop,
  latchNode,
  registerNode,
  counterNode,
  muxNode,
  demuxNode,
  decoderNode,
  encoderNode,
  adderNode,
  comparatorNode,
  aluNode,
  romNode,
  ramNode,
  splitNode,
  mergeNode,
  tunnelNode,
  scopeNode,
  sevenSegmentNode,
  hexDisplayNode,
  bargraphNode,
  portNode,
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
  { id: "timing", label: "Timing" },
  { id: "seq", label: "Sequential" },
  { id: "comb", label: "Combinational" },
  { id: "mem", label: "Memory" },
  { id: "bus", label: "Buses" },
  { id: "instruments", label: "Instruments" },
  { id: "sub", label: "Subcircuits" },
];

const byType = new Map(
  nodeDefinitions.map((definition) => [definition.type, definition]),
);

/** `NodeLookup` for the scene. Undefined for a type this build does not have. */
export const lookupNode: NodeLookup = (type) => byType.get(type);
