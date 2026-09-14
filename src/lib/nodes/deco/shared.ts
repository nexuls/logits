import type { NodeParams, ParamSpec } from "../define";
import { boundedParam } from "../shared";

/**
 * What the decorations share: the tint palette, and the size params the
 * canvas's resize handles write.
 *
 * Decorations are not part of the circuit — no pins, no `evaluate` — so
 * nothing here touches a signal. See `NodeDefinition.decoration`.
 */

/** Largest decoration in grid cells: a box round a whole board, not more. */
export const MAX_DECORATION_CELLS = 400;

/**
 * Hues for a group's fill or a note's background. Tokens rather than raw
 * values, like the LED colours, so the swatch the inspector draws and the
 * colour the view mixes from are one value; the views tint *from* them with
 * `color-mix`, which is what lets one hue read in both themes.
 */
export const TINT_OPTIONS = [
  { value: "gray", label: "Grey", swatch: "var(--logit-tint-gray)" },
  { value: "blue", label: "Blue", swatch: "var(--logit-tint-blue)" },
  { value: "teal", label: "Teal", swatch: "var(--logit-tint-teal)" },
  { value: "green", label: "Green", swatch: "var(--logit-tint-green)" },
  { value: "amber", label: "Amber", swatch: "var(--logit-tint-amber)" },
  { value: "red", label: "Red", swatch: "var(--logit-tint-red)" },
  { value: "purple", label: "Purple", swatch: "var(--logit-tint-purple)" },
  { value: "pink", label: "Pink", swatch: "var(--logit-tint-pink)" },
] as const;

/** `width` and `height` steppers, in grid cells. */
export function sizeParams(minWidth: number, minHeight: number): ParamSpec[] {
  return [
    {
      key: "width",
      label: "Width",
      kind: "int",
      min: minWidth,
      max: MAX_DECORATION_CELLS,
      hint: "Grid cells. Or drag a handle on the canvas.",
    },
    {
      key: "height",
      label: "Height",
      kind: "int",
      min: minHeight,
      max: MAX_DECORATION_CELLS,
    },
  ];
}

/** The `resize` declaration matching `sizeParams`. */
export function resizeSpec(minWidth: number, minHeight: number) {
  return {
    width: { key: "width", min: minWidth, max: MAX_DECORATION_CELLS },
    height: { key: "height", min: minHeight, max: MAX_DECORATION_CELLS },
  };
}

/** Clamped footprint, so a hand-edited file cannot produce a zero-size box. */
export function decorationSize(
  params: NodeParams,
  fallback: { width: number; height: number },
  min: { width: number; height: number },
) {
  return {
    width: boundedParam(
      params,
      "width",
      fallback.width,
      min.width,
      MAX_DECORATION_CELLS,
    ),
    height: boundedParam(
      params,
      "height",
      fallback.height,
      min.height,
      MAX_DECORATION_CELLS,
    ),
  };
}
