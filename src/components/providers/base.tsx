"use client";

import { useEffect, type ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import {
  APPEARANCE_FONT_SCALE_DEFAULT,
  DEFAULT_INTERFACE_FONT,
  DEFAULT_MONOSPACE_FONT,
  DEFAULT_TEXT_FONT,
  normalizeAppearanceFontScale,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveTextFontFamily,
  type UserSettings,
} from "@/data/schema";
import {
  ALL_COLOR_SCHEME_CLASSES,
  getColorSchemeClassName,
} from "@/coloe-scheme";
import { writeResolvedSystemThemeToCookie } from "@/data/settings-cookie";
import { AppSidebar } from "../sidebar/app-sidebar";
import { DataProvider } from "./data";
import { Toaster } from "../ui/sonner";
import { SidebarProvider } from "../ui/sidebar";
import { TooltipProvider } from "../ui/tooltip";
import { useUserSettings } from "@/hooks/use-user-settings";

type Props = {
  children?: ReactNode;
  initialSettings?: UserSettings;
};

function SettingsThemeSync() {
  const { settings } = useUserSettings();
  const { resolvedTheme, setTheme } = useTheme();
  const theme = settings.appearance?.theme ?? "system";
  const colorScheme = settings.appearance?.colorScheme;
  const fontSize =
    settings.appearance?.fontSize ?? APPEARANCE_FONT_SCALE_DEFAULT;
  const interfaceFont = settings.appearance?.interfaceFont ?? DEFAULT_INTERFACE_FONT;
  const textFont = settings.appearance?.textFont ?? DEFAULT_TEXT_FONT;
  const monospaceFont =
    settings.appearance?.monospaceFont ?? DEFAULT_MONOSPACE_FONT;

  useEffect(() => {
    setTheme(theme);
  }, [setTheme, theme]);

  useEffect(() => {
    if (theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const syncResolvedSystemTheme = () => {
      writeResolvedSystemThemeToCookie(mediaQuery.matches ? "dark" : "light");
    };

    syncResolvedSystemTheme();

    mediaQuery.addEventListener("change", syncResolvedSystemTheme);

    return () => {
      mediaQuery.removeEventListener("change", syncResolvedSystemTheme);
    };
  }, [theme]);

  useEffect(() => {
    const mode = resolvedTheme === "dark" ? "dark" : "light";
    const colorSchemeClass = getColorSchemeClassName(colorScheme, mode);
    const rootElement = document.documentElement;

    rootElement.classList.remove(...ALL_COLOR_SCHEME_CLASSES);
    rootElement.classList.add(colorSchemeClass);
  }, [colorScheme, resolvedTheme]);

  useEffect(() => {
    const rootElement = document.documentElement;

    rootElement.style.setProperty(
      "--user-interface-font",
      resolveInterfaceFontFamily(interfaceFont),
    );
    rootElement.style.setProperty("--user-text-font", resolveTextFontFamily(textFont));
    rootElement.style.setProperty(
      "--user-monospace-font",
      resolveMonospaceFontFamily(monospaceFont),
    );
    rootElement.style.setProperty(
      "--user-font-scale",
      String(normalizeAppearanceFontScale(fontSize)),
    );
  }, [fontSize, interfaceFont, monospaceFont, textFont]);

  return null;
}

export default function BaseProvider({ children, initialSettings }: Props) {
  const defaultTheme = initialSettings?.appearance?.theme ?? "system";

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      enableColorScheme
    >
      <TooltipProvider>
        <DataProvider initialSettings={initialSettings}>
          <SettingsThemeSync />
          <SidebarProvider>
            <AppSidebar />
            {children}
            <Toaster />
          </SidebarProvider>
        </DataProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
