import { buildPdfDocumentHtml } from "./render";
import type { PdfOptions, PdfTheme } from "./types";

type ExportArgs = {
  contentHtml: string;
  contentCss: string;
  options: PdfOptions;
  theme: PdfTheme;
};

/**
 * Renders the PDF document in a hidden iframe and triggers the browser's
 * print dialog. Users choose "Save as PDF" to materialise the actual file.
 *
 * We lean on the browser's print pipeline rather than shipping a heavier
 * JS PDF generator so output matches the preview byte-for-byte and stays
 * free of transitive dependencies.
 */
export function exportPdf({
  contentHtml,
  contentCss,
  options,
  theme,
}: ExportArgs) {
  if (typeof window === "undefined") return;

  const documentHtml = buildPdfDocumentHtml({
    contentHtml,
    contentCss,
    options,
    theme,
    forPreview: false,
  });

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.srcdoc = documentHtml;

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.addEventListener("load", () => {
    const contentWindow = iframe.contentWindow;
    if (!contentWindow) {
      cleanup();
      return;
    }

    // Setting the iframe's document title drives the default filename in
    // Chromium's "Save as PDF" dialog.
    if (iframe.contentDocument) {
      iframe.contentDocument.title = options.title || "Document";
    }

    // The iframe's own pagination script runs on `load` and writes a
    // `data-page-count` attribute when it's done. Wait for that before
    // firing the print dialog so the printed output includes every page.
    const waitForPagination = (attempt = 0) => {
      const doc = iframe.contentDocument;
      const ready = doc?.body?.getAttribute("data-page-count");
      if (ready || attempt > 50) {
        try {
          contentWindow.focus();
          contentWindow.print();
        } finally {
          setTimeout(cleanup, 1000);
        }
        return;
      }
      setTimeout(() => waitForPagination(attempt + 1), 50);
    };
    waitForPagination();
  });

  document.body.append(iframe);
}
