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
