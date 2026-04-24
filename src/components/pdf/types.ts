export type PageSize = "A4" | "Letter" | "Legal" | "A3" | "A5";

export type PageOrientation = "portrait" | "landscape";

export type HorizontalAlign = "left" | "center" | "right";

export type EdgeInset = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

/**
 * Shared options for the header and footer bands. Text styling and layout
 * live here so both surfaces expose the same controls.
 */
export type BandOptions = {
  text: string;
  align: HorizontalAlign;
  /** Font size in points. */
  fontSize: number;
  /** Whether to draw a separator line between the band and the content. */
  border: boolean;
  /** Padding between the page edge and the band, in millimetres. */
  padding: number;
};

export type PageNumberPlacement = "none" | "header" | "footer";

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
  header: BandOptions;
  footer: BandOptions;
  /** Where the page number lives — inline with the header, footer, or hidden. */
  pageNumberPlacement: PageNumberPlacement;
  /** Alignment of the page number within its host band. */
  pageNumberAlign: HorizontalAlign;
  pageNumberFormat: string;
  /**
   * Base font-size applied to `<html>` inside the preview/export document.
   * Content styles use rem units, so this scales the whole document.
   */
  contentScale: number;
  accentColor: string;
  /**
   * When true, overlays guides that show the page size, content area,
   * and header/footer bands.
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
