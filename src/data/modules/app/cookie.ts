import {
  createInitialUserSettings,
  normalizeUserSettings,
  type UserSettings,
} from "./settings";

export const USER_SETTINGS_COOKIE_NAME = "user_settings";
export const USER_SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const RESOLVED_SYSTEM_THEME_COOKIE_NAME = "resolved_system_theme";
export const RESOLVED_SYSTEM_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const RECENT_NOTEBOOK_SHORTCUTS_COOKIE_NAME =
  "recent_notebook_shortcuts";
export const RECENT_NOTEBOOK_SHORTCUTS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const MAX_RECENT_NOTEBOOK_SHORTCUTS = 4;

export type RecentNotebookShortcut = {
  id: string;
  name: string;
  openedAt: string;
};

function encodeUserSettings(settings: UserSettings) {
  return encodeURIComponent(JSON.stringify(normalizeUserSettings(settings)));
}

function decodeUserSettings(value: string) {
  return normalizeUserSettings(JSON.parse(decodeURIComponent(value)));
}

function encodeRecentNotebookShortcuts(shortcuts: RecentNotebookShortcut[]) {
  return encodeURIComponent(JSON.stringify(shortcuts));
}

function decodeRecentNotebookShortcuts(value: string) {
  const parsed = JSON.parse(decodeURIComponent(value));

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const { id, name, openedAt } = entry as {
        id?: unknown;
        name?: unknown;
        openedAt?: unknown;
      };

      if (typeof id !== "string" || !id.trim()) return null;
      if (typeof name !== "string" || !name.trim()) return null;
      if (typeof openedAt !== "string" || !openedAt.trim()) return null;

      return {
        id,
        name,
        openedAt,
      } satisfies RecentNotebookShortcut;
    })
    .filter((entry): entry is RecentNotebookShortcut => Boolean(entry))
    .slice(0, MAX_RECENT_NOTEBOOK_SHORTCUTS);
}

function readCookieValueFromDocument(cookieName: string) {
  if (typeof document === "undefined") return null;

  const segments = document.cookie
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const prefix = `${cookieName}=`;
  const match = segments.find((segment) => segment.startsWith(prefix));

  if (!match) return null;

  return match.slice(prefix.length);
}

export function dumpUserSettingsToCookie(settings: UserSettings) {
  return [
    `${USER_SETTINGS_COOKIE_NAME}=${encodeUserSettings(settings)}`,
    "Path=/",
    `Max-Age=${USER_SETTINGS_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}

export function retrieveUserSettingsFromCookieValue(value?: string | null) {
  if (!value) {
    return createInitialUserSettings();
  }

  try {
    return decodeUserSettings(value);
  } catch {
    return createInitialUserSettings();
  }
}

export function dumpRecentNotebookShortcutsToCookie(
  shortcuts: RecentNotebookShortcut[],
) {
  return [
    `${RECENT_NOTEBOOK_SHORTCUTS_COOKIE_NAME}=${encodeRecentNotebookShortcuts(shortcuts)}`,
    "Path=/",
    `Max-Age=${RECENT_NOTEBOOK_SHORTCUTS_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}

export function retrieveRecentNotebookShortcutsFromCookieValue(
  value?: string | null,
) {
  if (!value) return [];

  try {
    return decodeRecentNotebookShortcuts(value);
  } catch {
    return [];
  }
}

export function writeRecentNotebookShortcutsToCookie(
  shortcuts: RecentNotebookShortcut[],
) {
  if (typeof document === "undefined") return;

  document.cookie = dumpRecentNotebookShortcutsToCookie(shortcuts);
}

export function updateRecentNotebookShortcutsCookie(input: {
  notebookId: string;
  notebookName: string;
}) {
  if (typeof document === "undefined") return;

  const notebookId = input.notebookId.trim();
  const notebookName = input.notebookName.trim();
  if (!notebookId || !notebookName) return;

  const current = retrieveRecentNotebookShortcutsFromCookieValue(
    readCookieValueFromDocument(RECENT_NOTEBOOK_SHORTCUTS_COOKIE_NAME),
  );

  const nextEntry: RecentNotebookShortcut = {
    id: notebookId,
    name: notebookName,
    openedAt: new Date().toISOString(),
  };

  const deduped = current.filter((entry) => entry.id !== notebookId);
  writeRecentNotebookShortcutsToCookie(
    [nextEntry, ...deduped].slice(0, MAX_RECENT_NOTEBOOK_SHORTCUTS),
  );
}

export function writeUserSettingsToCookie(settings: UserSettings) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = dumpUserSettingsToCookie(settings);
}

export function retrieveResolvedSystemThemeFromCookieValue(
  value?: string | null,
) {
  if (value === "light" || value === "dark") {
    return value;
  }

  return null;
}

export function writeResolvedSystemThemeToCookie(theme: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = [
    `${RESOLVED_SYSTEM_THEME_COOKIE_NAME}=${theme}`,
    "Path=/",
    `Max-Age=${RESOLVED_SYSTEM_THEME_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
}
