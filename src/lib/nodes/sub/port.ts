import { defineNode, type NodeParams, stringParam } from "@/lib/nodes/define";
import { widthOf, widthParam } from "../shared";

/**
 * A boundary pin, placed *inside* a subcircuit definition.
 *
 * Its `direction` param is written from the chip's point of view, not the
 * port's: an "input" port is something the parent circuit drives into the
 * chip, so inside the definition it is a *source* and its `io` pin is an
 * output. Getting that backwards is the classic way to end up with every
 * signal reading Z, which is why it is spelled out here rather than left to
 * the reader.
 *
 * It has no `evaluate`. When the chip is inlined, this node's `io` net and the
 * instance pin's net become one net, so the port is a join and not a buffer.
 */
export const portNode = defineNode({
  type: "sub.port",
  title: "Port",
  icon: "port",
  category: "sub",
  keywords: ["port", "pin", "boundary", "subcircuit", "chip", "interface"],
  defaultParams: { name: "IN", direction: "in", width: 1 },
  paramsSchema: [
    {
      key: "name",
      label: "Port name",
      kind: "text",
      maxLength: 32,
      hint: "Becomes the pin's name on every instance of this chip.",
    },
    {
      key: "direction",
      label: "Direction",
      kind: "select",
      options: [
        { value: "in", label: "Input to the chip" },
        { value: "out", label: "Output from the chip" },
      ],
    },
    widthParam(),
  ],
  pins: (params) => [
    {
      // `inout`, not a direction: the port passes a signal across the
      // boundary and drives nothing itself. Declaring it as an output would
      // make every wired-up instance a two-driver short once the chip is
      // inlined, since the parent's driver lands on this very net.
      id: "io",
      name: portName(params),
      direction: "inout",
      width: widthOf(params),
      side: isInputPort(params) ? "right" : "left",
      offset: 2,
    },
  ],
  size: () => ({ width: 6, height: 4 }),
  boundaryPort: (params) => {
    const name = portName(params);
    return name.length > 0
      ? {
          name,
          pinId: "io",
          direction: isInputPort(params) ? ("in" as const) : ("out" as const),
        }
      : undefined;
  },
});

export function portName(params: NodeParams): string {
  return stringParam(params, "name", "").trim();
}

export function isInputPort(params: NodeParams): boolean {
  return stringParam(params, "direction", "in") !== "out";
}
