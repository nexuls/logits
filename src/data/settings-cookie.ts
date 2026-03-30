import {
  createInitialUserSettings,
  normalizeUserSettings,
  type UserSettings,
} from "@/data/schema";

export const USER_SETTINGS_COOKIE_NAME = "user_settings";
export const USER_SETTINGS_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const RESOLVED_SYSTEM_THEME_COOKIE_NAME = "resolved_system_theme";
export const RESOLVED_SYSTEM_THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function encodeUserSettings(settings: UserSettings) {
  return encodeURIComponent(JSON.stringify(normalizeUserSettings(settings)));
}

function decodeUserSettings(value: string) {
  return normalizeUserSettings(JSON.parse(decodeURIComponent(value)));
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

export function retrieveUserSettingsFromCookie(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return createInitialUserSettings();
  }

  const settingsCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${USER_SETTINGS_COOKIE_NAME}=`));

  if (!settingsCookie) {
    return createInitialUserSettings();
  }

  return retrieveUserSettingsFromCookieValue(
    settingsCookie.slice(USER_SETTINGS_COOKIE_NAME.length + 1),
  );
}

export function writeUserSettingsToCookie(settings: UserSettings) {
  if (typeof document === "undefined") {
    return;
  }

  // biome-ignore lint/suspicious/noDocumentCookie: no problem writing to cookie in browser environment
  document.cookie = dumpUserSettingsToCookie(settings);
}

export function dumpResolvedSystemThemeToCookie(theme: "light" | "dark") {
  return [
    `${RESOLVED_SYSTEM_THEME_COOKIE_NAME}=${theme}`,
    "Path=/",
    `Max-Age=${RESOLVED_SYSTEM_THEME_COOKIE_MAX_AGE}`,
    "SameSite=Lax",
  ].join("; ");
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

  // biome-ignore lint/suspicious/noDocumentCookie: no problem writing to cookie in browser environment
  document.cookie = dumpResolvedSystemThemeToCookie(theme);
}
