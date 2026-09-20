"use client";

import { cn } from "@/lib/utils";

/** The regions of the app, in the order the tour visits them. */
export const WORKSPACE_REGIONS = [
  {
    id: "projects",
    title: "Projects",
    blurb: "Everything you have built, plus the examples.",
    box: { x: 6, y: 6, width: 62, height: 188, rx: 8 },
    badge: { x: 37, y: 100 },
  },
  {
    id: "elements",
    title: "Elements",
    blurb: "The palette you drag parts out of.",
    box: { x: 252, y: 6, width: 62, height: 188, rx: 8 },
    badge: { x: 283, y: 100 },
  },
  {
    id: "canvas",
    title: "Canvas",
    blurb: "Where the circuit lives. Pan, zoom, place, wire.",
    box: { x: 74, y: 40, width: 172, height: 118, rx: 8 },
    // In the corner rather than the middle: the middle is where the token
    // circuit is drawn, and a badge over it would read as part of the circuit.
    badge: { x: 231, y: 145 },
  },
  {
    id: "toolbar",
    title: "Toolbar",
    blurb: "Run, pause, step, undo, save, diagnose.",
    box: { x: 124, y: 12, width: 82, height: 20, rx: 6 },
    badge: { x: 165, y: 22 },
  },
  {
    id: "minimap",
    title: "Minimap",
    blurb: "Where you are on a board bigger than the screen.",
    box: { x: 74, y: 164, width: 50, height: 28, rx: 6 },
    badge: { x: 99, y: 178 },
  },
  {
    id: "share",
    title: "Share",
    blurb: "One link that runs your circuit anywhere.",
    box: { x: 214, y: 12, width: 32, height: 20, rx: 6 },
    badge: { x: 230, y: 22 },
  },
] as const;

type Props = {
  /** Index into `WORKSPACE_REGIONS`, or null for none. */
  active: number | null;
  className?: string;
};

/**
 * A schematic of the app's own layout, numbered to match the legend beside it
 * and the tour that follows.
 *
 * Drawn rather than screenshotted: a picture would go stale the first time the
 * chrome moved, and would be wrong in whichever theme it was not captured in.
 * Everything here is a design token, so it is correct in both.
 */
export default function WorkspaceMap({ active, className }: Props) {
  return (
    <svg
      viewBox="0 0 320 200"
      className={cn("block size-full", className)}
      role="img"
      aria-label="Diagram of the Logits workspace: projects on the left, the canvas in the middle with its toolbar, minimap and share button, and the elements palette on the right."
    >
      <rect
        x={2}
        y={2}
        width={316}
        height={196}
        rx={12}
        className="fill-sidebar stroke-border"
        strokeWidth={1}
      />

      {/* The canvas grid, so the middle reads as the drawing surface rather
          than one more panel. */}
      <defs>
        <pattern
          id="workspace-map-grid"
          width={10}
          height={10}
          patternUnits="userSpaceOnUse"
        >
          <circle cx={1} cy={1} r={0.7} className="fill-muted-foreground/40" />
        </pattern>
      </defs>
      <rect
        x={72}
        y={6}
        width={176}
        height={188}
        rx={8}
        fill="url(#workspace-map-grid)"
        className="stroke-border"
        strokeWidth={1}
      />

      {/* A token circuit on the canvas: two inputs, a gate, a lamp. */}
      <g className="stroke-muted-foreground" strokeWidth={1.4} fill="none">
        <path d="M108 86 h18" />
        <path d="M108 112 h18" />
        <path d="M168 99 h22" />
      </g>
      <g className="fill-card stroke-foreground/40" strokeWidth={1.2}>
        <rect x={92} y={80} width={16} height={12} rx={3} />
        <rect x={92} y={106} width={16} height={12} rx={3} />
        <rect x={126} y={85} width={42} height={28} rx={5} />
      </g>
      <circle
        cx={198}
        cy={99}
        r={7}
        className="fill-primary/30 stroke-primary"
        strokeWidth={1.2}
      />

      {/* The project title chip, unnumbered — the legend has six entries and a
          seventh badge would fight them for attention. */}
      <rect
        x={74}
        y={12}
        width={44}
        height={20}
        rx={6}
        className="fill-card stroke-border"
        strokeWidth={1}
      />

      {WORKSPACE_REGIONS.map((region, at) => {
        const on = at === active;
        return (
          <g key={region.id}>
            <rect
              {...region.box}
              strokeWidth={on ? 2 : 1}
              className={cn(
                "transition-all duration-200",
                on
                  ? "fill-primary/12 stroke-primary"
                  : "fill-card/70 stroke-border",
              )}
            />
            <circle
              cx={region.badge.x}
              cy={region.badge.y}
              r={9}
              className={cn(
                "transition-colors duration-200",
                on ? "fill-primary" : "fill-muted",
              )}
            />
            <text
              x={region.badge.x}
              y={region.badge.y}
              textAnchor="middle"
              dominantBaseline="central"
              className={cn(
                "text-[10px] font-semibold transition-colors duration-200",
                on ? "fill-primary-foreground" : "fill-muted-foreground",
              )}
            >
              {at + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
