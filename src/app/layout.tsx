import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import type { CSSProperties } from "react";
import BaseProvider from "@/components/providers/base";
import {
  RESOLVED_SYSTEM_THEME_COOKIE_NAME,
  USER_SETTINGS_COOKIE_NAME,
  retrieveResolvedSystemThemeFromCookieValue,
  retrieveUserSettingsFromCookieValue,
} from "@/data/modules/app/cookie";
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
import {
  getColorSchemeClassName,
  getColorSchemeStylesheetText,
  getManifestThemeColor,
} from "@/color-schemes";
import { classNamesForFontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logits",
  description:
    "A modern notebook workspace for writing, organizing, and editing notes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialSettings = retrieveUserSettingsFromCookieValue(
    cookieStore.get(USER_SETTINGS_COOKIE_NAME)?.value,
  );
  const resolvedSystemTheme = retrieveResolvedSystemThemeFromCookieValue(
    cookieStore.get(RESOLVED_SYSTEM_THEME_COOKIE_NAME)?.value,
  );
  const configuredTheme = initialSettings.appearance?.theme ?? "system";
  const effectiveTheme =
    configuredTheme === "system"
      ? (resolvedSystemTheme ?? "light")
      : configuredTheme;
  const isDark = effectiveTheme === "dark";
  const initialColorSchemeClass = getColorSchemeClassName(
    initialSettings.appearance?.colorScheme,
    isDark ? "dark" : "light",
  );
  const initialFontSize =
    initialSettings.appearance?.fontSize ?? APPEARANCE_FONT_SCALE_DEFAULT;
  const initialHtmlStyle = {
    "--user-interface-font": resolveInterfaceFontFamily(
      initialSettings.appearance?.interfaceFont ?? DEFAULT_INTERFACE_FONT,
    ),
    "--user-text-font": resolveTextFontFamily(
      initialSettings.appearance?.textFont ?? DEFAULT_TEXT_FONT,
    ),
    "--user-monospace-font": resolveMonospaceFontFamily(
      initialSettings.appearance?.monospaceFont ?? DEFAULT_MONOSPACE_FONT,
    ),
    "--user-font-scale": String(normalizeAppearanceFontScale(initialFontSize)),
  } as CSSProperties;
  const rootClassName = [
    isDark ? "dark" : "",
    initialColorSchemeClass,
    ...classNamesForFontVariables,
  ]
    .filter(Boolean)
    .join(" ");
  const colorSchemeStylesheet = getColorSchemeStylesheetText();
  const { themeColor } = getManifestThemeColor(
    initialSettings.appearance?.colorScheme,
    isDark ? "dark" : "light",
  );

  return (
    <html
      lang="en"
      className={rootClassName}
      style={initialHtmlStyle}
      suppressHydrationWarning
    >
      <head>
        <style id="logits-color-schemes">{colorSchemeStylesheet}</style>
        <meta name="theme-color" content={themeColor} />
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
      </head>

      <body className="font-geist antialiased">
        <BaseProvider initialSettings={initialSettings}>
          {children}
        </BaseProvider>
      </body>
    </html>
  );
}
