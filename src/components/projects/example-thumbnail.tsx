import { memo, useMemo } from "react";

import type { CircuitDocument } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import { smoothPath } from "@/lib/circuit/wire-path";
import { colorParam } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { cn } from "@/lib/utils";
import {
  boundsOf,
  buildScene,
  isEnclosure,
  sceneClusters,
} from "@/state/scene";

type Props = {
  document: CircuitDocument;
  className?: string;
};

/** World units kept clear round the circuit, so nothing touches the frame. */
const PADDING = 24;

/**
 * A still of a circuit: its footprint as one SVG, fitted to the box.
 *
 * Drawn from the same scene the canvas renders — node bounds, routed wires,
 * group tints — rather than running a preview per card, so a gallery of every
 * example costs no simulations and no DOM nodes per element. The viewBox does
 * the fitting, and `non-scaling-stroke` keeps lines a hairline whether the
 * circuit is two gates or the calculator.
 */
function ExampleThumbnail({ document, className }: Props) {
  const drawing = useMemo(() => {
    const scene = buildScene(document, subcircuitLookup(document, lookupNode));
    const bounds = boundsOf(sceneClusters(scene));
    if (!bounds) return null;

    const nodes = Object.values(scene.nodes);
    return {
      viewBox: [
        bounds.x - PADDING,
        bounds.y - PADDING,
        bounds.width + PADDING * 2,
        bounds.height + PADDING * 2,
      ].join(" "),
      enclosures: nodes.filter(isEnclosure),
      // Notes and other decorations are content, not parts: a faint wash,
      // so the eye goes to the circuit first.
      notes: nodes.filter((node) => node.def.decoration && !isEnclosure(node)),
      parts: nodes.filter((node) => !node.def.decoration),
      wires: Object.values(scene.wires).filter(
        (wire) => wire.points.length >= 2,
      ),
    };
  }, [document]);

  return (
    <svg
      viewBox={drawing?.viewBox ?? "0 0 1 1"}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
      className={cn("block size-full", className)}
    >
      <title>{document.name}</title>
      {drawing?.enclosures.map(({ node, def, bounds }) => {
        const tint = colorParam(def, node.params) ?? "var(--logit-tint-gray)";
        return (
          <rect
            key={node.id}
            x={bounds.x}
            y={bounds.y}
            width={bounds.width}
            height={bounds.height}
            rx={6}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1}
            style={{
              fill: `color-mix(in oklch, ${tint} 14%, transparent)`,
              stroke: `color-mix(in oklch, ${tint} 50%, transparent)`,
            }}
          />
        );
      })}

      {drawing?.notes.map(({ node, bounds }) => (
        <rect
          key={node.id}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={4}
          className="fill-muted-foreground/10"
        />
      ))}

      {drawing?.wires.map(({ wire, points }) => (
        <path
          key={wire.id}
          d={smoothPath(points)}
          fill="none"
          vectorEffect="non-scaling-stroke"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-muted-foreground/70"
        />
      ))}

      {drawing?.parts.map(({ node, bounds }) => (
        <rect
          key={node.id}
          x={bounds.x}
          y={bounds.y}
          width={bounds.width}
          height={bounds.height}
          rx={5}
          vectorEffect="non-scaling-stroke"
          strokeWidth={1}
          className="fill-card stroke-foreground/35"
        />
      ))}
    </svg>
  );
}

export default memo(ExampleThumbnail);
