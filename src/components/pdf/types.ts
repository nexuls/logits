export type PageSize = "A4" | "Letter" | "Legal" | "A3" | "A5";

export type PageOrientation = "portrait" | "landscape";

export type PageNumberPosition =
  | "none"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type EdgeInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * User-configurable options for a PDF render.
 *
 * All distances are in millimetres; typography sizes are in points (pt).
 * `pageNumberFormat` accepts `{n}` (current page) and `{total}` (total pages);
 * both are substituted at render time by the pagination script.
 */
export type PdfOptions = {
  title: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  margin: EdgeInset;
  pageNumbers: PageNumberPosition;
  pageNumberFormat: string;
  headerText: string;
  footerText: string;
  /**
   * Base font-size applied to `<html>` inside the preview/export document.
   * Content styles use rem units, so this scales the whole document.
   */
  contentScale: number;
  accentColor: string;
  /**
   * When true, renders dashed outlines around the margin band to help
   * the user see how the layout is spaced.
   */
  visualizeLayout: boolean;
};

/**
 * Theme bundle the PDF renderer applies inside the iframe so the draftly
 * preview CSS (which relies on `--color-*` tokens) resolves to the active
 * app colour scheme.
 */
export type PdfTheme = {
  /** `<html>` class — e.g. `"logits-light"`. */
  className: string;
  /** Space-separated next/font variable classes applied to `<html>`. */
  fontClassNames?: string;
  /**
   * Raw CSS rules defining the scheme's custom properties. Rendered into
   * the iframe verbatim alongside a small bridging stylesheet that maps
   * `--color-*` tokens to the underlying scheme variables.
   */
  css: string;
  /** Resolved appearance tokens copied from app settings. */
  appearance: {
    interfaceFontFamily: string;
    textFontFamily: string;
    monospaceFontFamily: string;
    fontScale: number;
  };
};
