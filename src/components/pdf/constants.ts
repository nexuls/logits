import type { PageSize, PdfOptions } from "./types";

export const PAGE_SIZES_MM: Record<
  PageSize,
  { width: number; height: number }
> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
};

export const PAGE_SIZE_OPTIONS: PageSize[] = [
  "A4",
  "Letter",
  "Legal",
  "A3",
  "A5",
];

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  title: "Document",
  pageSize: "A4",
  orientation: "portrait",
  margin: { top: 10, right: 20, bottom: 10, left: 20 },
  pageNumbers: "bottom-center",
  pageNumberFormat: "{n} / {total}",
  headerText: "",
  footerText: "",
  contentScale: 100,
  accentColor: "#111827",
  visualizeLayout: false,
};

export const ZOOM_PRESETS: number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;
export const ZOOM_STEP = 0.1;

/**
 * Returns the physical page dimensions in millimetres, honouring orientation.
 */
export function getPageDimensions(options: {
  pageSize: PageSize;
  orientation: "portrait" | "landscape";
}) {
  const base = PAGE_SIZES_MM[options.pageSize];
  if (options.orientation === "landscape") {
    return { width: base.height, height: base.width };
  }
  return base;
}
