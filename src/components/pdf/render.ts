import { getPageDimensions } from "./constants";
import type {
  BandOptions,
  HorizontalAlign,
  PdfOptions,
  PdfTheme,
} from "./types";

type BuildArgs = {
  /** Rendered markdown HTML (or any sanitized HTML) that becomes the page body. */
  contentHtml: string;
  /** CSS that styles the rendered HTML (typography, highlighting, etc.). */
  contentCss: string;
  /** User-configured PDF options. */
  options: PdfOptions;
  /**
   * Active colour scheme. Applied to `<html>` inside the iframe so the draftly
   * preview CSS — which uses `--color-*` tokens — renders with app colours.
   */
  theme: PdfTheme;
  /** If true, include preview-only chrome (drop shadow, page gutter). */
  forPreview: boolean;
};

/**
 * Snapshot the host document's stylesheets as plain CSS text so we can
 * replay them inside the iframe. Tailwind v4 generates utility CSS into
 * one of these sheets at build time — without this, any utility classes
 * used by rendered markdown (or by draftly's preview wrappers) fall back
 * to unstyled output in the PDF. Cross-origin sheets throw on `cssRules`
 * access; we skip those silently.
 */
function collectHostCss(): string {
  if (typeof document === "undefined") return "";
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        parts.push(rule.cssText);
      }
    } catch {
      // cross-origin sheet — cannot read
    }
  }
  return parts.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\u003c");
}

function htmlClassName(theme: PdfTheme): string {
  return [theme.className, theme.fontClassNames]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/**
 * Bridges Tailwind's `@theme inline` token aliases so the draftly preview CSS
 * (which references `--color-foreground`, `--color-primary`, …) resolves
 * inside the iframe. The app would normally emit these via Tailwind at
 * build-time; the iframe has no Tailwind, so we reproduce the mapping here.
 */
function buildThemeBridgeCss(theme: PdfTheme): string {
  const fontScale = Number.isFinite(theme.appearance.fontScale)
    ? theme.appearance.fontScale
    : 1;

  return `:root {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --user-interface-font: ${theme.appearance.interfaceFontFamily};
  --user-text-font: ${theme.appearance.textFontFamily};
  --user-monospace-font: ${theme.appearance.monospaceFontFamily};
  --user-font-scale: ${fontScale};
  --text-xs: calc(0.75rem * var(--user-font-scale));
  --text-sm: calc(0.875rem * var(--user-font-scale));
  --text-base: calc(1rem * var(--user-font-scale));
  --text-lg: calc(1.125rem * var(--user-font-scale));
  --text-xl: calc(1.25rem * var(--user-font-scale));
  --text-2xl: calc(1.37rem * var(--user-font-scale));
  --text-3xl: calc(1.6rem * var(--user-font-scale));
  --text-4xl: calc(2rem * var(--user-font-scale));
  --text-5xl: calc(3rem * var(--user-font-scale));
  --text-6xl: calc(3.75rem * var(--user-font-scale));
  --text-7xl: calc(4.5rem * var(--user-font-scale));
  --text-8xl: calc(6rem * var(--user-font-scale));
  --text-9xl: calc(8rem * var(--user-font-scale));
}`;
}

function bandHasContent(
  band: BandOptions,
  includesPageNumber: boolean,
): boolean {
  return Boolean(band.text) || includesPageNumber;
}

/**
 * Returns the self-contained document rendered inside the preview iframe
 * and used as the print source.
 *
 * Pagination is done in the iframe itself: the script at the bottom
 * measures the rendered content, clones it once per page, and applies a
 * CSS `translate` so each page shows its own vertical slice. Headers,
 * footers, page numbers, and optional layout guides are layered on top of
 * each slice. Print output inherits the same structure because each
 * `.pdf-page` is sized to the physical page and uses
 * `break-after: page`.
 */
export function buildPdfDocumentHtml({
  contentHtml,
  contentCss,
  options,
  theme,
  forPreview,
}: BuildArgs): string {
  const { width: pageWidth, height: pageHeight } = getPageDimensions(options);
  const contentWidth = pageWidth - options.margin.left - options.margin.right;
  const contentHeight = pageHeight - options.margin.top - options.margin.bottom;

  const { header, footer } = options;
  const pageNumberInHeader = options.pageNumberPlacement === "header";
  const pageNumberInFooter = options.pageNumberPlacement === "footer";

  const headerVisible = bandHasContent(header, pageNumberInHeader);
  const footerVisible = bandHasContent(footer, pageNumberInFooter);

  const previewChrome = forPreview
    ? `
      body { background: #e5e7eb; padding: 24px 0; }
      .pdf-page {
        box-shadow: 0 8px 28px rgba(15, 23, 42, 0.18);
        margin: 0 auto 32px;
      }
    `
    : `
      body { background: white; padding: 0; }
      .pdf-page { box-shadow: none; margin: 0 auto; }
    `;

  const frameCss = `
    *, *::before, *::after { box-sizing: border-box; }
    /* Neutralise host globals that would break the PDF surface. */
    html { font-size: ${options.contentScale}%; }
    html, body { margin: 0; padding: 0; overflow: visible; width: auto; height: auto; }
    * { user-select: text; cursor: auto; }
    body {
      font-family: var(--user-text-font, system-ui, -apple-system, Segoe UI, Roboto, sans-serif);
      font-size: var(--text-base, 1rem);
      color: ${options.accentColor};
      line-height: 1.6;
      background: var(--background, white);
    }
    #pdf-source {
      position: absolute;
      left: -10000px;
      top: 0;
      width: ${contentWidth}mm;
      visibility: hidden;
      pointer-events: none;
    }
    #pdf-pages { display: block; }
    .pdf-page {
      width: ${pageWidth}mm;
      height: ${pageHeight}mm;
      background: white;
      color: ${options.accentColor};
      position: relative;
      overflow: hidden;
      break-after: page;
      page-break-after: always;
    }
    .pdf-page:last-child { break-after: auto; page-break-after: auto; }
    .pdf-margin-box {
      position: absolute;
      top: ${options.margin.top}mm;
      left: ${options.margin.left}mm;
      right: ${options.margin.right}mm;
      bottom: ${options.margin.bottom}mm;
      overflow: hidden;
    }
    .pdf-content-slice {
      position: absolute;
      inset: 0;
      overflow: hidden;
    }
    .pdf-canvas-clone {
      width: ${contentWidth}mm;
      will-change: transform;
    }
    .pdf-band {
      position: absolute;
      left: ${options.margin.left}mm;
      right: ${options.margin.right}mm;
      color: #555;
      min-height: 1lh;
    }
    .pdf-band > .pdf-band-slot {
      position: absolute;
      top: 0;
      display: flex;
      align-items: center;
      min-width: 0;
      max-width: calc(100% - 2mm);
    }
    .pdf-band > .pdf-band-slot[data-align="left"] {
      left: 0;
      justify-content: flex-start;
      text-align: left;
    }
    .pdf-band > .pdf-band-slot[data-align="center"] {
      left: 50%;
      transform: translateX(-50%);
      justify-content: center;
      text-align: center;
    }
    .pdf-band > .pdf-band-slot[data-align="right"] {
      right: 0;
      justify-content: flex-end;
      text-align: right;
    }
    .pdf-band .pdf-band-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pdf-band .pdf-page-number { white-space: nowrap; }
    .pdf-header {
      top: ${header.padding}mm;
      font-size: ${header.fontSize}pt;
      ${header.border ? "border-bottom: 1px solid #e5e7eb; padding-bottom: 1.5mm;" : ""}
    }
    .pdf-footer {
      bottom: ${footer.padding}mm;
      font-size: ${footer.fontSize}pt;
      ${footer.border ? "border-top: 1px solid #e5e7eb; padding-top: 1.5mm;" : ""}
    }
    .pdf-layout-guide {
      position: absolute;
      pointer-events: none;
    }
    .pdf-layout-guide[data-kind="margin"] {
      inset: ${options.margin.top}mm ${options.margin.right}mm ${options.margin.bottom}mm ${options.margin.left}mm;
      border: 1px dashed rgba(59, 130, 246, 0.8);
      background: rgba(59, 130, 246, 0.04);
    }
    .pdf-layout-guide[data-kind="header-band"] {
      top: ${Math.max(header.padding - 2, 0)}mm;
      left: ${options.margin.left}mm;
      right: ${options.margin.right}mm;
      height: ${Math.max(header.fontSize * 0.5, 6)}mm;
      border: 1px dashed rgba(16, 185, 129, 0.9);
      background: rgba(16, 185, 129, 0.1);
    }
    .pdf-layout-guide[data-kind="footer-band"] {
      bottom: ${Math.max(footer.padding - 2, 0)}mm;
      left: ${options.margin.left}mm;
      right: ${options.margin.right}mm;
      height: ${Math.max(footer.fontSize * 0.5, 6)}mm;
      border: 1px dashed rgba(217, 70, 239, 0.9);
      background: rgba(217, 70, 239, 0.08);
    }
    .pdf-layout-label {
      position: absolute;
      font-family: var(--user-interface-font, system-ui, sans-serif);
      font-size: 8pt;
      letter-spacing: 0.02em;
      padding: 1mm 2mm;
      border-radius: 2mm;
      pointer-events: none;
      white-space: nowrap;
    }
    .pdf-layout-label[data-kind="page"] {
      top: 3mm;
      left: 3mm;
      color: #1d4ed8;
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.45);
    }
    .pdf-layout-label[data-kind="content"] {
      top: calc(${options.margin.top}mm + 1mm);
      left: calc(${options.margin.left}mm + 1mm);
      color: #047857;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.5);
    }
    .pdf-layout-label[data-kind="header"] {
      top: ${Math.max(header.padding - 2, 0)}mm;
      right: ${options.margin.right}mm;
      transform: translateY(-110%);
      color: #047857;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.5);
    }
    .pdf-layout-label[data-kind="footer"] {
      bottom: ${Math.max(footer.padding - 2, 0)}mm;
      right: ${options.margin.right}mm;
      transform: translateY(110%);
      color: #a21caf;
      background: rgba(217, 70, 239, 0.12);
      border: 1px solid rgba(217, 70, 239, 0.5);
    }
    ${previewChrome}
    @media print {
      body { background: white; padding: 0; }
      #pdf-pages { margin: 0; }
      .pdf-page { box-shadow: none; margin: 0; }
      .pdf-layout-guide, .pdf-layout-label { display: none !important; }
    }
    @page { size: ${pageWidth}mm ${pageHeight}mm; margin: 0; }
  `;

  // Payload consumed by the in-iframe pagination script. We stringify from
  // outside so the template doesn't have to worry about escaping user input.
  const scriptConfig = {
    contentHeightMm: contentHeight,
    pageWidthMm: pageWidth,
    pageHeightMm: pageHeight,
    contentWidthMm: contentWidth,
    marginTopMm: options.margin.top,
    marginRightMm: options.margin.right,
    marginBottomMm: options.margin.bottom,
    marginLeftMm: options.margin.left,
    header: {
      text: header.text,
      align: header.align as HorizontalAlign,
      visible: headerVisible,
    },
    footer: {
      text: footer.text,
      align: footer.align as HorizontalAlign,
      visible: footerVisible,
    },
    pageNumber: {
      placement: options.pageNumberPlacement,
      align: options.pageNumberAlign as HorizontalAlign,
      format: options.pageNumberFormat,
    },
    visualizeLayout: options.visualizeLayout,
  };

  const paginationScript = `
    (function() {
      var cfg = JSON.parse("${escapeJs(JSON.stringify(scriptConfig))}");
      function mmToPx(mm) {
        var probe = document.createElement("div");
        probe.style.cssText = "position:absolute;visibility:hidden;height:100mm;";
        document.body.appendChild(probe);
        var px = probe.getBoundingClientRect().height / 100;
        probe.remove();
        return mm * px;
      }
      function makeSlot(align) {
        var slot = document.createElement("div");
        slot.className = "pdf-band-slot";
        slot.setAttribute("data-align", align);
        return slot;
      }
      function ensureSlot(slots, align) {
        if (!slots[align]) {
          slots[align] = makeSlot(align);
        }
        return slots[align];
      }
      function buildBand(kind, bandCfg, attachPageNumber, pageNumberCfg, pageIndex, pageCount) {
        var band = document.createElement("div");
        band.className = "pdf-band pdf-" + kind;
        var slots = { left: null, center: null, right: null };
        if (bandCfg.text) {
          var textSlot = ensureSlot(slots, bandCfg.align);
          var textEl = document.createElement("span");
          textEl.className = "pdf-band-text";
          textEl.textContent = bandCfg.text;
          textSlot.appendChild(textEl);
        }
        if (attachPageNumber) {
          var numberSlot = ensureSlot(slots, pageNumberCfg.align);
          var badge = document.createElement("span");
          badge.className = "pdf-page-number";
          badge.textContent = pageNumberCfg.format
            .replace(/\\{n\\}/g, String(pageIndex + 1))
            .replace(/\\{total\\}/g, String(pageCount));
          numberSlot.appendChild(badge);
        }
        ["left", "center", "right"].forEach(function(align) {
          var slot = slots[align] || makeSlot(align);
          band.appendChild(slot);
        });
        return band;
      }
      function addVisualization(page) {
        var marginGuide = document.createElement("div");
        marginGuide.className = "pdf-layout-guide";
        marginGuide.setAttribute("data-kind", "margin");
        page.appendChild(marginGuide);
        if (cfg.header.visible) {
          var headerGuide = document.createElement("div");
          headerGuide.className = "pdf-layout-guide";
          headerGuide.setAttribute("data-kind", "header-band");
          page.appendChild(headerGuide);
          var headerLabel = document.createElement("div");
          headerLabel.className = "pdf-layout-label";
          headerLabel.setAttribute("data-kind", "header");
          headerLabel.textContent = "Header";
          page.appendChild(headerLabel);
        }
        if (cfg.footer.visible) {
          var footerGuide = document.createElement("div");
          footerGuide.className = "pdf-layout-guide";
          footerGuide.setAttribute("data-kind", "footer-band");
          page.appendChild(footerGuide);
          var footerLabel = document.createElement("div");
          footerLabel.className = "pdf-layout-label";
          footerLabel.setAttribute("data-kind", "footer");
          footerLabel.textContent = "Footer";
          page.appendChild(footerLabel);
        }
        var pageLabel = document.createElement("div");
        pageLabel.className = "pdf-layout-label";
        pageLabel.setAttribute("data-kind", "page");
        pageLabel.textContent = "Page " + formatMm(cfg.pageWidthMm) + " × " + formatMm(cfg.pageHeightMm) + " mm";
        page.appendChild(pageLabel);
        var contentLabel = document.createElement("div");
        contentLabel.className = "pdf-layout-label";
        contentLabel.setAttribute("data-kind", "content");
        contentLabel.textContent = "Content " + formatMm(cfg.contentWidthMm) + " × " + formatMm(cfg.contentHeightMm) + " mm";
        page.appendChild(contentLabel);
      }
      function formatMm(value) {
        return (Math.round(value * 10) / 10).toString();
      }
      // Collect candidate break offsets (top of each block element) so
      // pagination snaps to element boundaries instead of slicing through
      // the middle of a paragraph or list item.
      function collectBreakpoints(source) {
        var breakpoints = [0];
        var sourceTop = source.getBoundingClientRect().top;
        function walk(node) {
          for (var j = 0; j < node.children.length; j++) {
            var child = node.children[j];
            var top = child.getBoundingClientRect().top - sourceTop;
            breakpoints.push(top);
            var tag = child.tagName;
            if (tag === "UL" || tag === "OL" || tag === "BLOCKQUOTE" || tag === "DIV" || tag === "SECTION" || tag === "ARTICLE" || tag === "LI") {
              walk(child);
            }
          }
        }
        walk(source);
        breakpoints.sort(function(a, b) { return a - b; });
        // dedupe
        var unique = [];
        for (var k = 0; k < breakpoints.length; k++) {
          if (k === 0 || breakpoints[k] - breakpoints[k - 1] > 0.5) unique.push(breakpoints[k]);
        }
        return unique;
      }
      function computePageStarts(breakpoints, sourceHeight, contentHeightPx) {
        var starts = [0];
        var safetyLimit = 1000;
        while (starts[starts.length - 1] + contentHeightPx < sourceHeight && starts.length < safetyLimit) {
          var cursor = starts[starts.length - 1];
          var limit = cursor + contentHeightPx;
          var chosen = -1;
          for (var b = 0; b < breakpoints.length; b++) {
            var bp = breakpoints[b];
            if (bp > cursor + 1 && bp <= limit) chosen = bp;
          }
          // No safe break inside the window — a single block is taller than
          // a page. Fall back to a hard cut to avoid an infinite loop.
          if (chosen < 0) chosen = limit;
          starts.push(chosen);
        }
        return starts;
      }
      function paginate() {
        var source = document.getElementById("pdf-source");
        var pages = document.getElementById("pdf-pages");
        if (!source || !pages) return;
        var pxPerMm = mmToPx(1);
        var contentHeightPx = cfg.contentHeightMm * pxPerMm;
        var sourceHeightPx = source.getBoundingClientRect().height;
        var breakpoints = collectBreakpoints(source);
        var pageStarts = computePageStarts(breakpoints, sourceHeightPx, contentHeightPx);
        var pageCount = pageStarts.length;
        pages.innerHTML = "";
        for (var i = 0; i < pageCount; i++) {
          var page = document.createElement("div");
          page.className = "pdf-page";
          if (cfg.visualizeLayout) addVisualization(page);
          if (cfg.header.visible) {
            page.appendChild(buildBand("header", cfg.header, cfg.pageNumber.placement === "header", cfg.pageNumber, i, pageCount));
          }
          if (cfg.footer.visible) {
            page.appendChild(buildBand("footer", cfg.footer, cfg.pageNumber.placement === "footer", cfg.pageNumber, i, pageCount));
          }
          var marginBox = document.createElement("div");
          marginBox.className = "pdf-margin-box";
          var slice = document.createElement("div");
          slice.className = "pdf-content-slice";
          var nextStart = i < pageCount - 1 ? pageStarts[i + 1] : sourceHeightPx;
          var sliceHeight = Math.max(0, Math.min(contentHeightPx, nextStart - pageStarts[i]));
          slice.style.height = sliceHeight + "px";
          var clone = source.cloneNode(true);
          clone.removeAttribute("id");
          clone.className = "pdf-canvas-clone";
          clone.style.transform = "translateY(" + (-pageStarts[i]) + "px)";
          slice.appendChild(clone);
          marginBox.appendChild(slice);
          page.appendChild(marginBox);
          pages.appendChild(page);
        }
        document.body.setAttribute("data-page-count", String(pageCount));
      }
      // Block browser-level ctrl/meta+wheel zoom while the pointer is over
      // the iframe. Wheel events inside a same-origin iframe don't bubble
      // up to the parent document, so the host's listener cannot catch
      // them — we have to preventDefault in here too.
      if (${forPreview ? "true" : "false"}) {
        window.addEventListener("wheel", function(event) {
          if (event.ctrlKey || event.metaKey) event.preventDefault();
        }, { passive: false, capture: true });
      }
      if (document.readyState === "complete") {
        paginate();
      } else {
        window.addEventListener("load", paginate);
      }
      // Re-paginate when images finish decoding (they change source height).
      window.addEventListener("load", function() {
        var images = document.querySelectorAll("#pdf-source img");
        var remaining = images.length;
        if (!remaining) return;
        images.forEach(function(img) {
          if (img.complete) {
            remaining -= 1;
            if (remaining === 0) paginate();
            return;
          }
          img.addEventListener("load", function() {
            remaining -= 1;
            if (remaining === 0) paginate();
          });
          img.addEventListener("error", function() {
            remaining -= 1;
            if (remaining === 0) paginate();
          });
        });
      });
    })();
  `;

  const hostCss = collectHostCss();

  return `<!doctype html>
<html class="${escapeHtml(htmlClassName(theme))}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(options.title || "Document")}</title>
<style>${theme.css}</style>
<style>${buildThemeBridgeCss(theme)}</style>
${hostCss ? `<style>${hostCss}</style>` : ""}
<style>${contentCss}</style>
<style>${frameCss}</style>
</head>
<body>
<div id="pdf-source">${contentHtml}</div>
<div id="pdf-pages"></div>
<script>${paginationScript}</script>
</body>
</html>`;
}
