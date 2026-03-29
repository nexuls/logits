"use client";

import { useEffect, type ReactNode } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import type { UserSettings } from "@/data/schema";
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
