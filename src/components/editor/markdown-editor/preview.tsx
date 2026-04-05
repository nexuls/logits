"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";

import {
  allPlugins,
  generateCSS,
  preview,
  ThemeEnum,
} from "@/components/draftly";
import { DEFAULT_COLOR_SCHEME, getCodeMirrorTheme } from "@/color-schemes";
import { useUserSettings } from "@/hooks/use-user-settings";

type Props = {
  content: string;
};

export default function Preview({ content }: Props) {
  const { resolvedTheme: theme } = useTheme();
  const { settings } = useUserSettings();

  const colorScheme = settings.appearance?.colorScheme ?? DEFAULT_COLOR_SCHEME;
  const resolvedMode = theme === "dark" ? "dark" : "light";
  const resolvedTheme =
    theme && theme !== "system"
      ? theme.includes("dark")
        ? ThemeEnum.DARK
        : ThemeEnum.LIGHT
      : ThemeEnum.AUTO;

  const colorSchemeCodeMirrorTheme = useMemo(
    () => getCodeMirrorTheme(colorScheme, resolvedMode),
    [colorScheme, resolvedMode],
  );

  const previewStyles = useMemo(
    () =>
      generateCSS({
        plugins: allPlugins,
        theme: resolvedTheme,
        syntaxTheme: colorSchemeCodeMirrorTheme,
        includeBase: true,
      }),
    [resolvedTheme, colorSchemeCodeMirrorTheme],
  );

  const [html, setHtml] = useState("");

  useEffect(() => {
    let isDisposed = false;

    void preview(content, {
      plugins: allPlugins,
      markdown: [],
      theme: resolvedTheme,
      syntaxTheme: colorSchemeCodeMirrorTheme,
      sanitize: true,
    }).then((renderedHtml) => {
      if (isDisposed) return;
      setHtml(renderedHtml);
    });

    return () => {
      isDisposed = true;
    };
  }, [content, resolvedTheme, colorSchemeCodeMirrorTheme]);

  return (
    <div className="relative w-full min-h-0 flex-1">
      <style>{previewStyles}</style>
      <div
        className="w-full h-full overflow-y-auto **:select-text"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-linear-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-linear-to-t from-background to-transparent" />
    </div>
  );
}
