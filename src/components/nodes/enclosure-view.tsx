import { groupHeader, groupStyle } from "@/lib/nodes/deco/group";
import { colorParam } from "@/lib/nodes/define";
import type { NodeViewProps } from "./node-views";

/**
 * A box drawn round part of the circuit: a tinted wash, an outline, and a
 * header with a title and subtitle.
 *
 * Every colour is mixed from one tint token rather than chosen per theme — a
 * faint wash over transparent for the body, the tint pulled toward the
 * foreground for the title — so one hue reads on the dark canvas and the light
 * one alike. The header's height comes from `groupHeader`, the same function
 * the hit-test grabs the group by, so the strip that picks it up is the strip
 * on screen.
 */
export default function EnclosureView({ node, def }: NodeViewProps) {
  const header = groupHeader(node.params);
  const style = groupStyle(node.params);
  const tint = colorParam(def, node.params) ?? "var(--logit-tint-gray)";
  const filled = style === "filled";

  const mix = (percent: number) =>
    `color-mix(in oklch, ${tint} ${percent}%, transparent)`;

  return (
    <div
      role="img"
      aria-label={
        [header.title || def.title, header.subtitle]
          .filter(Boolean)
          .join(": ") || def.title
      }
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-md border-2"
      style={{
        borderColor: mix(filled ? 45 : 70),
        borderStyle: style === "dashed" ? "dashed" : "solid",
        background: filled ? mix(9) : "transparent",
      }}
    >
      {header.height > 0 && (
        <div
          className="flex flex-col justify-center overflow-hidden border-b px-2.5"
          style={{
            height: header.height,
            borderColor: mix(filled ? 30 : 40),
            borderStyle: style === "dashed" ? "dashed" : "solid",
            background: filled ? mix(14) : "transparent",
          }}
        >
          {header.title && (
            <div
              className="truncate font-semibold"
              style={{
                fontSize: header.titleSize,
                lineHeight: 1.25,
                color: `color-mix(in oklch, ${tint} 55%, var(--foreground))`,
              }}
            >
              {header.title}
            </div>
          )}
          {header.subtitle && (
            <div
              className="truncate text-muted-foreground"
              style={{ fontSize: header.subtitleSize, lineHeight: 1.35 }}
            >
              {header.subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
