import { defineNode, type NodeParams, stringParam } from "@/lib/nodes/define";
import { boundedParam } from "../shared";
import { decorationSize, resizeSpec, sizeParams, TINT_OPTIONS } from "./shared";

const MIN = { width: 2, height: 2 };
const DEFAULT_SIZE = { width: 20, height: 8 };

const DEFAULT_FONT_SIZE = 12;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 96;

/** Enough for a paragraph of notes; a document belongs somewhere else. */
export const MAX_TEXT_LENGTH = 10_000;

export type TextFormat = "markdown" | "plain";
export type TextAlign = "left" | "center" | "right";

export function textContent(params: NodeParams): string {
  return stringParam(params, "text", "").slice(0, MAX_TEXT_LENGTH);
}

export function textFormat(params: NodeParams): TextFormat {
  return stringParam(params, "format", "markdown") === "plain"
    ? "plain"
    : "markdown";
}

export function textAlign(params: NodeParams): TextAlign {
  const align = stringParam(params, "align", "left");
  return align === "center" || align === "right" ? align : "left";
}

export function textFontSize(params: NodeParams): number {
  return boundedParam(
    params,
    "fontSize",
    DEFAULT_FONT_SIZE,
    MIN_FONT_SIZE,
    MAX_FONT_SIZE,
  );
}

export const textNode = defineNode({
  type: "deco.text",
  title: "Text",
  docs: `
Words on the canvas: a heading over a circuit, a note explaining a trick, the
instructions for an example. Plain text or basic Markdown. It is decoration
only — no pins, and the simulation never sees it.

## Behaviour

With **Format** set to Markdown the text understands the everyday subset:
\`#\` headings, **bold**, *italic*, \`inline code\`, bulleted and numbered
lists, \`>\` quotes, links and rules. Raw HTML is shown as
text, not run, and an image as its alt text. **Plain** writes the text exactly as typed, line breaks and
all.

Text that does not fit the box is clipped, so size the box to the words — or
lower **Font size**.

## Typical uses

- A title and a one-line description over a board.
- A sticky note: pick a **Background** and it reads as a coloured card.
- Step-by-step instructions beside the switches of an example circuit.

## On the canvas

1. Place it from the palette, then double-click it — or press Enter while it
   is selected, or **Edit text** in the inspector — and type where it sits.
   Markdown styles itself as you write, showing its marks only on the line
   you are on. Click outside, press the check mark under the box, or press
   Esc to finish; the whole edit is one undo step.
2. Drag the handles on its corners and edges to size it, or set **Width** and
   **Height** in the inspector.
3. **Font size**, **Align**, **Colour** and **Background** style it. Text
   paints above wires, so a note can sit on top of the circuit it describes.`,
  icon: "text",
  category: "deco",
  keywords: [
    "text",
    "label",
    "note",
    "comment",
    "markdown",
    "heading",
    "title",
    "annotation",
    "decoration",
    "sticky",
  ],
  view: "annotation",
  defaultParams: {
    text: "## Notes\nDescribe this part of the circuit.",
    format: "markdown",
    fontSize: DEFAULT_FONT_SIZE,
    align: "left",
    color: "default",
    background: "none",
    ...DEFAULT_SIZE,
  },
  paramsSchema: [
    {
      key: "text",
      label: "Text",
      kind: "text",
      multiline: true,
      maxLength: MAX_TEXT_LENGTH,
    },
    {
      key: "format",
      label: "Format",
      kind: "select",
      options: [
        { value: "markdown", label: "Markdown" },
        { value: "plain", label: "Plain text" },
      ],
    },
    {
      key: "fontSize",
      label: "Font size",
      kind: "int",
      min: MIN_FONT_SIZE,
      max: MAX_FONT_SIZE,
    },
    {
      key: "align",
      label: "Align",
      kind: "select",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
        { value: "right", label: "Right" },
      ],
    },
    {
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "default", label: "Default", swatch: "var(--foreground)" },
        {
          value: "muted",
          label: "Muted",
          swatch: "var(--muted-foreground)",
        },
        ...TINT_OPTIONS,
      ],
    },
    {
      key: "background",
      label: "Background",
      kind: "color",
      options: [
        { value: "none", label: "None", swatch: "transparent" },
        ...TINT_OPTIONS,
      ],
    },
    ...sizeParams(MIN.width, MIN.height),
  ],
  pins: () => [],
  size: (params) => decorationSize(params, DEFAULT_SIZE, MIN),
  resize: resizeSpec(MIN.width, MIN.height),
  decoration: {},
  editInPlace: "text",
});
