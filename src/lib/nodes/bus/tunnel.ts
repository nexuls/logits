import { defineNode, stringParam } from "@/lib/nodes/define";
import { widthOf, widthParam } from "../shared";

/**
 * A named net. Every tunnel sharing a `name` is one net, with no wire drawn
 * between them — the escape hatch for a clock or a reset that would otherwise
 * cross the whole sheet.
 *
 * It has no `evaluate` at all: the join happens in `buildNetlist`, through the
 * `netAliases` contract, so a tunnel is genuinely the same net rather than a
 * pair of buffers pretending to be one. A blank name joins nothing, which
 * makes a freshly placed tunnel inert instead of shorting itself onto every
 * other unnamed one.
 */
export const tunnelNode = defineNode({
  type: "bus.tunnel",
  docs: `
A named net. Every tunnel sharing a **Net name** is one net, with no wire drawn
between them.

## Behaviour

The escape hatch for a signal that would otherwise cross the whole sheet — a
clock, a reset, a supply rail. Place one tunnel where the signal is produced
and another wherever it is needed, give both the same name, and they are
electrically the same net.

This is a genuine join, not a pair of buffers pretending to be one: there is no
extra delay, no direction, and no driver added. Its pin is \`inout\` because a
tunnel is neither end of anything — whichever side drives, the other reads.

A **blank name joins nothing**, so a freshly placed tunnel is inert rather than
shorting itself onto every other unnamed one. Names are matched exactly, after
trimming whitespace.

Set **Bit width** to match the signal. Two tunnels sharing a name but not a
width is a mistake the wire diagnostics will flag.

## Use it sparingly

A tunnel hides a connection. Two of them make a circuit far easier to read; a
dozen make it impossible to follow, because nothing on screen shows what is
wired to what. Reach for one when a wire would cross the sheet, and draw the
wire when it would not.

## Typical uses

- Distributing a clock to every flip-flop without a spider of wires.
- A global reset line.
- Naming a bus that several distant blocks read.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Tunnel",
  icon: "tunnel",
  category: "bus",
  keywords: ["tunnel", "label", "net", "name", "jump", "structure"],
  defaultParams: { name: "", width: 1 },
  view: "tunnel",
  paramsSchema: [
    {
      key: "name",
      label: "Net name",
      kind: "text",
      maxLength: 64,
      hint: "Tunnels sharing a name are one net.",
    },
    widthParam(),
  ],
  pins: (params) => [
    {
      // `inout`, because a tunnel is neither end of anything: whichever side
      // drives, the other reads.
      id: "io",
      name: "NET",
      direction: "inout",
      width: widthOf(params),
      side: "left",
      offset: 2,
    },
  ],
  size: () => ({ width: 6, height: 4 }),
  netAliases: (params): Record<string, string> => {
    const name = stringParam(params, "name", "").trim();
    return name.length > 0 ? { io: name } : {};
  },
});
