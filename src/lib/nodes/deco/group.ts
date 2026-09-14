import { GRID_SIZE } from "@/lib/circuit/geometry";
import {
  boolParam,
  defineNode,
  type NodeParams,
  stringParam,
} from "@/lib/nodes/define";
import { boundedParam } from "../shared";
import { decorationSize, resizeSpec, sizeParams, TINT_OPTIONS } from "./shared";

const MIN = { width: 8, height: 4 };
const DEFAULT_SIZE = { width: 40, height: 24 };

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 48;

/** World units of padding round the header text, above and below. */
export const GROUP_HEADER_PADDING = 6;

export type GroupStyle = "filled" | "outlined" | "dashed";

export type GroupHeader = {
  title: string;
  subtitle: string;
  titleSize: number;
  subtitleSize: number;
  /** World units the header takes, padding included. */
  height: number;
  /** The same, in whole grid cells — the strip that grabs the group. */
  cells: number;
};

/**
 * The header's text and how tall it is.
 *
 * One function for both the view that draws the header and the hit-test that
 * grabs by it, so the strip a press picks the group up by is exactly the strip
 * the user can see.
 */
export function groupHeader(params: NodeParams): GroupHeader {
  const title = stringParam(params, "title", "").trim();
  const subtitle = stringParam(params, "subtitle", "").trim();
  const titleSize = boundedParam(
    params,
    "fontSize",
    DEFAULT_FONT_SIZE,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
  );
  const subtitleSize = Math.max(MIN_FONT_SIZE, Math.round(titleSize * 0.72));

  const text =
    (title ? titleSize * 1.25 : 0) + (subtitle ? subtitleSize * 1.35 : 0);
  const height = text > 0 ? text + GROUP_HEADER_PADDING * 2 : 0;
  const { height: bodyCells } = decorationSize(params, DEFAULT_SIZE, MIN);

  return {
    title,
    subtitle,
    titleSize,
    subtitleSize,
    height,
    // At least a cell, so an untitled group still has something to grab it
    // by besides its edge; never more than the group itself.
    cells: Math.min(bodyCells, Math.max(1, Math.ceil(height / GRID_SIZE))),
  };
}

export function groupStyle(params: NodeParams): GroupStyle {
  const style = stringParam(params, "style", "filled");
  return style === "outlined" || style === "dashed" ? style : "filled";
}

export const groupNode = defineNode({
  type: "deco.group",
  title: "Group",
  docs: `
A labelled box drawn round part of a circuit, to show which gates belong
together — "Adder", "Control", "Stage 2" — with a title, an optional subtitle
and a background colour. It is decoration only: it has no pins and nothing in
the simulation knows it is there.

## Behaviour

A group sits **beneath** the wires and every other element, so it never hides
the circuit it frames. It is picked up by its **header** or its **edge**; a
press anywhere else inside it reaches whatever is there, or starts a rubber
band on empty space, exactly as if the group were not drawn.

With **Move contents** on (the default), dragging the group brings everything
lying wholly inside it along, wires and their bends included. Turn it off to
slide the box on its own. A rubber band only selects a group it completely
surrounds.

## Typical uses

- Framing the stages of a pipeline, or the datapath apart from the control.
- A titled panel round the inputs a user is meant to operate.
- Colour-coding one circuit's blocks in an example or a write-up.

## On the canvas

1. Place it from the palette, then drag the handles on its corners and edges
   to size it round the parts it groups. **Width** and **Height** in the
   inspector do the same from the keyboard.
2. Set the **Title**, **Subtitle**, **Header size** and **Colour** in the
   inspector. **Style** picks a tinted fill, an outline, or a dashed outline.
3. Nested groups work: the larger one is always drawn underneath.`,
  icon: "frame",
  category: "deco",
  keywords: [
    "group",
    "frame",
    "box",
    "section",
    "region",
    "container",
    "annotation",
    "decoration",
    "label",
  ],
  view: "enclosure",
  defaultParams: {
    title: "Group",
    subtitle: "",
    color: "blue",
    style: "filled",
    fontSize: DEFAULT_FONT_SIZE,
    carry: true,
    ...DEFAULT_SIZE,
  },
  paramsSchema: [
    { key: "title", label: "Title", kind: "text", maxLength: 120 },
    { key: "subtitle", label: "Subtitle", kind: "text", maxLength: 200 },
    {
      key: "fontSize",
      label: "Header size",
      kind: "int",
      min: MIN_FONT_SIZE,
      max: MAX_FONT_SIZE,
      hint: "The title's size; the subtitle follows it.",
    },
    { key: "color", label: "Colour", kind: "color", options: TINT_OPTIONS },
    {
      key: "style",
      label: "Style",
      kind: "select",
      options: [
        { value: "filled", label: "Tinted fill" },
        { value: "outlined", label: "Outline" },
        { value: "dashed", label: "Dashed outline" },
      ],
    },
    {
      key: "carry",
      label: "Move contents",
      kind: "bool",
      hint: "Dragging the group brings what lies inside it.",
    },
    ...sizeParams(MIN.width, MIN.height),
  ],
  pins: () => [],
  size: (params) => decorationSize(params, DEFAULT_SIZE, MIN),
  resize: resizeSpec(MIN.width, MIN.height),
  decoration: {
    enclosure: {
      headerCells: (params) => groupHeader(params).cells,
      carries: (params) => boolParam(params, "carry", true),
    },
  },
});
