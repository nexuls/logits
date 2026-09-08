import type { ParamSpec } from "@/lib/nodes/define";

/**
 * Memory images, as the document stores them: whitespace- or comma-separated
 * hexadecimal words, lowest address first.
 *
 * Text rather than an array param because it is what a user can type, paste
 * and diff, and because `paramsSchema` has no array control — the inspector
 * picks a control from a small closed set on purpose (see `define.ts`).
 */

export const MAX_CONTENTS_LENGTH = 8192;

export const CONTENTS_PARAM: ParamSpec = {
  key: "contents",
  label: "Contents",
  kind: "text",
  maxLength: MAX_CONTENTS_LENGTH,
  hint: "Hex words, lowest address first. Anything unlisted reads 0.",
};

/**
 * Parses an image into `size` cells. Deliberately forgiving: this is
 * hand-typed data, and a stray token should leave a zero rather than break the
 * simulation, which has no way to report a parse error.
 */
export function parseContents(
  text: string,
  size: number,
  width: number,
): number[] {
  const cells = new Array<number>(size).fill(0);
  const mask = 2 ** width;

  const tokens = text.split(/[\s,]+/).filter((token) => token.length > 0);
  for (let index = 0; index < Math.min(tokens.length, size); index++) {
    const value = Number.parseInt(tokens[index].replace(/^0x/i, ""), 16);
    cells[index] = Number.isFinite(value) ? ((value % mask) + mask) % mask : 0;
  }

  return cells;
}
