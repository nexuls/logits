"use client";

/**
 * PDF workspace view.
 *
 * Reads the file's markdown content, renders it through the shared draftly
 * pipeline, and feeds the resulting HTML/CSS to the PDF preview + export
 * helpers in `@/components/pdf`. Controls and preview sit side-by-side,
 * collapsing to a stacked layout in narrow panes via container queries.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DEFAULT_PDF_OPTIONS,
  PdfControls,
  PdfPreview,
  exportPdf,
  type PdfOptions,
  type PdfTheme,
} from "@/components/pdf";
import {
  allPlugins,
  generateCSS,
  preview as renderMarkdownPreview,
  ThemeEnum,
} from "@/components/draftly";
import {
  APPEARANCE_FONT_SCALE_DEFAULT,
  DEFAULT_INTERFACE_FONT,
  DEFAULT_MONOSPACE_FONT,
  DEFAULT_TEXT_FONT,
  normalizeAppearanceFontScale,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveTextFontFamily,
} from "@/data/modules/app/settings";
import { classNamesForFontVariables } from "@/app/fonts";
import {
  DEFAULT_COLOR_SCHEME,
  getCodeMirrorTheme,
  getColorSchemeClassName,
  getColorSchemeStylesheetText,
  type ResolvedAppearanceMode,
} from "@/color-schemes";
import { useNotebooks } from "@/hooks/use-notebooks";
import { useUserSettings } from "@/hooks/use-user-settings";
import { Button } from "@/components/ui/button";

import { getTextFileUnsupportedState } from "../empty-states";
import type { WorkspaceView, WorkspaceViewProps } from "../types";

const VIEW_NAME = "pdf";

function PdfViewContent({ fileId }: WorkspaceViewProps) {
  const { files, getFileContent } = useNotebooks();
  const { settings } = useUserSettings();
  const { resolvedTheme } = useTheme();

  const file = useMemo(
    () => files.find((candidate) => candidate.id === fileId) ?? null,
    [files, fileId],
  );
  const initialTitle = file?.name ?? DEFAULT_PDF_OPTIONS.title;

  const [content, setContent] = useState("");
  const [html, setHtml] = useState("");
  const [isControlsOpen, setIsControlsOpen] = useState(false);
  const [options, setOptions] = useState<PdfOptions>(() => ({
    ...DEFAULT_PDF_OPTIONS,
    title: initialTitle,
  }));

  // Keep the title in sync with the file name unless the user has changed
  // it manually (we detect manual edits by comparing against the last known
  // file-derived title).
  const [autoTitle, setAutoTitle] = useState(initialTitle);
  useEffect(() => {
    if (!file) return;
    setOptions((current) =>
      current.title === autoTitle ? { ...current, title: file.name } : current,
    );
    setAutoTitle(file.name);
  }, [file, autoTitle]);

  const colorScheme = settings.appearance?.colorScheme ?? DEFAULT_COLOR_SCHEME;
  const interfaceFont =
    settings.appearance?.interfaceFont ?? DEFAULT_INTERFACE_FONT;
  const textFont = settings.appearance?.textFont ?? DEFAULT_TEXT_FONT;
  const monospaceFont =
    settings.appearance?.monospaceFont ?? DEFAULT_MONOSPACE_FONT;
  const fontScale = normalizeAppearanceFontScale(
    settings.appearance?.fontSize ?? APPEARANCE_FONT_SCALE_DEFAULT,
  );
  const resolvedMode: ResolvedAppearanceMode =
    resolvedTheme === "dark" ? "dark" : "light";

  // The exported PDF always renders light so documents don't inherit the
  // user's dark-mode palette — but we still want the draftly typography and
  // syntax colours to come from the active scheme's light variant.
  const codeMirrorTheme = useMemo(
    () => getCodeMirrorTheme(colorScheme, "light"),
    [colorScheme],
  );

  const pdfTheme = useMemo<PdfTheme>(
    () => ({
      className: getColorSchemeClassName(colorScheme, "light"),
      fontClassNames: classNamesForFontVariables.join(" "),
      css: getColorSchemeStylesheetText(),
      appearance: {
        interfaceFontFamily: resolveInterfaceFontFamily(interfaceFont),
        textFontFamily: resolveTextFontFamily(textFont),
        monospaceFontFamily: resolveMonospaceFontFamily(monospaceFont),
        fontScale,
      },
    }),
    [colorScheme, fontScale, interfaceFont, monospaceFont, textFont],
  );
  // `resolvedMode` drives the host chrome, not the iframe contents; still
  // reference it so the memo list stays honest if that ever changes.
  void resolvedMode;

  const contentCss = useMemo(
    () =>
      generateCSS({
        plugins: allPlugins,
        theme: ThemeEnum.LIGHT,
        syntaxTheme: codeMirrorTheme,
        includeBase: true,
      }),
    [codeMirrorTheme],
  );

  useEffect(() => {
    let isCancelled = false;
    void getFileContent(fileId).then((storedContent) => {
      if (isCancelled) return;
      setContent(storedContent);
    });
    return () => {
      isCancelled = true;
    };
  }, [fileId, getFileContent]);

  useEffect(() => {
    let isCancelled = false;
    void renderMarkdownPreview(content, {
      plugins: allPlugins,
      markdown: [],
      theme: ThemeEnum.LIGHT,
      syntaxTheme: codeMirrorTheme,
      sanitize: true,
    }).then((rendered) => {
      if (isCancelled) return;
      setHtml(rendered);
    });
    return () => {
      isCancelled = true;
    };
  }, [content, codeMirrorTheme]);

  const handleExport = useCallback(() => {
    exportPdf({ contentHtml: html, contentCss, options, theme: pdfTheme });
  }, [html, contentCss, options, pdfTheme]);

  const toggleControls = useCallback(() => {
    setIsControlsOpen((current) => !current);
  }, []);

  const closeControls = useCallback(() => {
    setIsControlsOpen(false);
  }, []);

  return (
    <div className="@container relative h-full min-h-0 w-full">
      <div className="flex h-full min-h-0 w-full">
        <aside
          className={`hidden w-80 shrink-0 min-h-0 bg-background transition-[transform,margin,opacity] duration-300 ease-out @5xl:block ${
            !isControlsOpen
              ? "translate-x-0 ml-0"
              : "-translate-x-full -ml-80 pointer-events-none"
          }`}
        >
          <PdfControls
            options={options}
            onChangeAction={setOptions}
            onExportAction={handleExport}
          />
        </aside>
        <section className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/40">
          <PdfPreview
            contentHtml={html}
            contentCss={contentCss}
            options={options}
            theme={pdfTheme}
            showControlsToggle
            controlsOpen={isControlsOpen}
            onToggleControlsAction={toggleControls}
          />
        </section>
      </div>

      <div
        className={`absolute inset-0 z-30 @5xl:hidden ${
          isControlsOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!isControlsOpen}
      >
        <button
          type="button"
          className={`absolute inset-0 bg-black/45 backdrop-blur-[1px] transition-opacity duration-300 ${
            isControlsOpen ? "opacity-100" : "opacity-0"
          }`}
          onClick={closeControls}
          aria-label="Close PDF controls"
        />
        <aside
          className={`absolute inset-x-3 top-3 h-full max-h-[calc(100%-1.5rem)] max-w-96 w-full overflow-auto rounded-lg border border-border bg-background shadow-2xl transition-all duration-300 ${
            isControlsOpen
              ? "translate-x-0 opacity-100"
              : "-translate-x-6 opacity-0"
          }`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2 backdrop-blur-sm">
            <p className="text-sm font-medium">PDF controls</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={closeControls}
              aria-label="Close PDF controls panel"
            >
              <X className="size-4" />
            </Button>
          </div>
          <PdfControls
            className="h-[calc(100%-3.5rem)]"
            options={options}
            onChangeAction={setOptions}
            onExportAction={handleExport}
          />
        </aside>
      </div>
    </div>
  );
}

export const pdfView: WorkspaceView = {
  name: VIEW_NAME,
  getTitle: (file) => `${file.name} (PDF)`,
  getUnsupportedState: (file) =>
    getTextFileUnsupportedState(file.metadata.type),
  Component: PdfViewContent,
};
