import type { AppData, UserSettings } from "@/data/schema";
import {
  createInitialUserSettings,
  normalizeUserSettings,
} from "@/data/schema";

function nowIso() {
  return new Date().toISOString();
}

function nextData(data: AppData, patch: Partial<AppData>): AppData {
  return {
    ...data,
    ...patch,
    version: data.version + 1,
    updatedAt: nowIso(),
  };
}

export function mergeUserSettings(
  currentSettings: UserSettings,
  nextSettings: Partial<UserSettings>,
) {
  return normalizeUserSettings({
    ...currentSettings,
    ...nextSettings,
    appearance: {
      ...currentSettings.appearance,
      ...nextSettings.appearance,
    },
  });
}

export function getUserSettings(data: AppData) {
  return normalizeUserSettings(data.settings);
}

export function setUserSettings(data: AppData, settings: UserSettings) {
  return nextData(data, {
    settings: normalizeUserSettings(settings),
  });
}

export function updateUserSettings(
  data: AppData,
  settings: Partial<UserSettings>,
) {
  return nextData(data, {
    settings: mergeUserSettings(getUserSettings(data), settings),
  });
}

export function resetUserSettings(data: AppData) {
  return nextData(data, {
    settings: createInitialUserSettings(),
  });
}
