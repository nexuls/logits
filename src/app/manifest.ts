import type { MetadataRoute } from "next";
import { cookies } from "next/headers";
import { getManifestThemeColor } from "@/color-schemes";
import {
  RECENT_NOTEBOOK_SHORTCUTS_COOKIE_NAME,
  RESOLVED_SYSTEM_THEME_COOKIE_NAME,
  USER_SETTINGS_COOKIE_NAME,
  retrieveRecentNotebookShortcutsFromCookieValue,
  retrieveResolvedSystemThemeFromCookieValue,
  retrieveUserSettingsFromCookieValue,
} from "@/data/modules/app/cookie";
import { buildNotebookUrl } from "@/lib/notebook-url";

export const revalidate = 0;

const MAX_MANIFEST_SHORTCUTS = 4;

function toManifestShortcutName(notebookName: string) {
  const normalized = notebookName.trim();
  if (!normalized) return "Open notebook";
  if (normalized.length <= 30) return normalized;
  return `${normalized.slice(0, 27)}...`;
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cookieStore = await cookies();

  const settings = retrieveUserSettingsFromCookieValue(
    cookieStore.get(USER_SETTINGS_COOKIE_NAME)?.value,
  );
  const resolvedSystemTheme = retrieveResolvedSystemThemeFromCookieValue(
    cookieStore.get(RESOLVED_SYSTEM_THEME_COOKIE_NAME)?.value,
  );

  const configuredTheme = settings.appearance?.theme ?? "system";
  const effectiveTheme =
    configuredTheme === "system"
      ? (resolvedSystemTheme ?? "light")
      : configuredTheme;
  const mode = effectiveTheme === "dark" ? "dark" : "light";
  const themeColor = getManifestThemeColor(
    settings.appearance?.colorScheme,
    mode,
  );

  const recentNotebookShortcuts =
    retrieveRecentNotebookShortcutsFromCookieValue(
      cookieStore.get(RECENT_NOTEBOOK_SHORTCUTS_COOKIE_NAME)?.value,
    )
      .slice(0, MAX_MANIFEST_SHORTCUTS)
      .map((entry) => ({
        name: toManifestShortcutName(entry.name),
        short_name: "Open",
        description: `Open ${entry.name}`,
        url: buildNotebookUrl(entry.id),
        icons: [
          {
            src: "/favicon.ico",
            sizes: "any",
            type: "image/x-icon",
          },
        ],
      }));

  return {
    name: "Logits",
    short_name: "Logits",
    description:
      "A modern notebook workspace for writing, organizing, and editing notes.",
    start_url: "/",
    display: "standalone",
    background_color: themeColor,
    theme_color: themeColor,
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
    ],
    shortcuts: recentNotebookShortcuts,
  };
}
