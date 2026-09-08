import {
  ActivityIcon,
  BinaryIcon,
  CalculatorIcon,
  ChevronsLeftRightIcon,
  CircleDotIcon,
  ClockIcon,
  ComponentIcon,
  CpuIcon,
  DatabaseIcon,
  EqualIcon,
  GaugeIcon,
  GitMergeIcon,
  GitPullRequestArrowIcon,
  Grid2x2Icon,
  HardDriveIcon,
  HashIcon,
  HourglassIcon,
  LightbulbIcon,
  ListOrderedIcon,
  type LucideProps,
  MilestoneIcon,
  PlugIcon,
  RectangleEllipsisIcon,
  RectangleHorizontalIcon,
  RowsIcon,
  SignalHighIcon,
  SplitIcon,
  SquareChevronRightIcon,
  ToggleRightIcon,
  ZapIcon,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

/**
 * The icons the palette draws for node definitions.
 *
 * A definition names one with its `icon` field — a string, because
 * `src/lib/nodes/` may not import React. This file is the one place that maps
 * those names to components, the same way `view` will map to a node's custom
 * renderer (see artifacts/05-node-authoring-guide.md).
 *
 * Keys name a *shape*, not a node type: several nodes can share "lamp", and a
 * new node normally reuses an entry here rather than adding one. Nothing keyed
 * by node `type` may live in this file.
 *
 * The gate symbols are IEEE/ANSI distinctive shapes, drawn to lucide's
 * conventions — 24×24, stroke `currentColor`, round caps — so they sit beside
 * the lucide icons below without looking pasted in.
 */

export type NodeIcon = ComponentType<SVGProps<SVGSVGElement>>;

const GATE_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const satisfies SVGProps<SVGSVGElement>;

/**
 * Geometry notes, because these are hand-drawn rather than exported from a set:
 * every body spans x 4→18 and y 4→20, so an AND and an OR are the same weight
 * in a list, and the negating bubble always sits at x 20 where the plain
 * output lead would start. At 24px that leaves the *back* of the shape — flat
 * for AND, bowed for OR, doubled for XOR — as the thing that identifies it,
 * which is what makes them readable in the collapsed rail.
 */

/** Leads at the two input pins, from the edge of the box to the body. */
const INPUT_LEADS = "M1 8.5h3M1 15.5h3";

/** Crossing leads: the XOR family's second back arc sits where these start. */
const XOR_INPUT_LEADS = "M0 8.5h5M0 15.5h5";

const OUTPUT_LEAD = "M18 12h5";

/** Flat back, semicircular nose. */
const AND_BODY = "M4 4h6a8 8 0 0 1 0 16H4z";

/** Bowed back, pointed nose. */
const OR_BODY = "M4 4c2.5 4.5 2.5 11.5 0 16 9 0 13-4.5 14-8-1-3.5-5-8-14-8z";

/** The extra back arc that turns an OR into an XOR, one unit to its left. */
const XOR_ARC = "M1 4c2.5 4.5 2.5 11.5 0 16";

const TRIANGLE = "M5 3.5 17 12 5 20.5z";

function Bubble({ cx }: { cx: number }) {
  return <circle cx={cx} cy="12" r="2" />;
}

function AndIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d={INPUT_LEADS} />
      <path d={AND_BODY} />
      <path d={OUTPUT_LEAD} />
    </svg>
  );
}

function NandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d={INPUT_LEADS} />
      <path d={AND_BODY} />
      <Bubble cx={20} />
    </svg>
  );
}

function OrIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d={INPUT_LEADS} />
      <path d={OR_BODY} />
      <path d={OUTPUT_LEAD} />
    </svg>
  );
}

function NorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d={INPUT_LEADS} />
      <path d={OR_BODY} />
      <Bubble cx={20} />
    </svg>
  );
}

function XorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d={XOR_INPUT_LEADS} />
      <path d={XOR_ARC} />
      <path d={OR_BODY} />
      <path d={OUTPUT_LEAD} />
    </svg>
  );
}

function XnorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d={XOR_INPUT_LEADS} />
      <path d={XOR_ARC} />
      <path d={OR_BODY} />
      <Bubble cx={20} />
    </svg>
  );
}

function InverterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d="M1 12h4" />
      <path d={TRIANGLE} />
      <Bubble cx={19} />
    </svg>
  );
}

function BufferIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d="M1 12h4" />
      <path d={TRIANGLE} />
      <path d="M17 12h6" />
    </svg>
  );
}

/** A buffer with its enable lead — the only gate whose control pin is drawn. */
function TristateIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...GATE_PROPS} {...props} aria-hidden="true" focusable="false">
      <path d="M1 12h4" />
      <path d={TRIANGLE} />
      <path d="M17 12h6" />
      <path d="M11 7.7V2" />
    </svg>
  );
}

/** Lucide icons take their own props type; both satisfy `NodeIcon`. */
const lucide = (Icon: ComponentType<LucideProps>): NodeIcon => Icon;

const NODE_ICONS: Record<string, NodeIcon> = {
  and: AndIcon,
  nand: NandIcon,
  or: OrIcon,
  nor: NorIcon,
  xor: XorIcon,
  xnor: XnorIcon,
  inverter: InverterIcon,
  buffer: BufferIcon,
  tristate: TristateIcon,
  toggle: lucide(ToggleRightIcon),
  "push-button": lucide(CircleDotIcon),
  binary: lucide(BinaryIcon),
  lamp: lucide(LightbulbIcon),
  gauge: lucide(GaugeIcon),
  clock: lucide(ClockIcon),
  pulse: lucide(ZapIcon),
  hourglass: lucide(HourglassIcon),
  "flip-flop": lucide(SquareChevronRightIcon),
  latch: lucide(RectangleHorizontalIcon),
  register: lucide(RowsIcon),
  counter: lucide(ListOrderedIcon),
  mux: lucide(GitMergeIcon),
  demux: lucide(GitPullRequestArrowIcon),
  decoder: lucide(Grid2x2Icon),
  encoder: lucide(HashIcon),
  adder: lucide(CalculatorIcon),
  comparator: lucide(EqualIcon),
  alu: lucide(CpuIcon),
  rom: lucide(DatabaseIcon),
  ram: lucide(HardDriveIcon),
  split: lucide(SplitIcon),
  merge: lucide(ChevronsLeftRightIcon),
  tunnel: lucide(MilestoneIcon),
  scope: lucide(ActivityIcon),
  "seven-segment": lucide(RectangleEllipsisIcon),
  hex: lucide(BinaryIcon),
  bargraph: lucide(SignalHighIcon),
  chip: lucide(CpuIcon),
  port: lucide(PlugIcon),
};

/**
 * Resolves a definition's `icon`. Falls back to a generic part rather than
 * rendering nothing, so a node with a missing or misspelled name still has a
 * hit target the same size as its neighbours.
 */
export function nodeIcon(name: string | undefined): NodeIcon {
  return (name && NODE_ICONS[name]) || lucide(ComponentIcon);
}
