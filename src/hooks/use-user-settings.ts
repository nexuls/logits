"use client";

import { useCallback, useMemo } from "react";
import { useDataStore } from "@/data/context";
import {
  createInitialUserSettings,
  normalizeUserSettings,
} from "@/data/modules/app/settings";
import { writeUserSettingsToCookie } from "@/data/modules/app/cookie";

export function useUserSettings() {
  const { store, settings, isHydrating, setSettingsState } = useDataStore();

  const reloadSettings = useCallback(async () => {
    const next = await store.app.getSettings();
    setSettingsState(next);
    writeUserSettingsToCookie(next);
    return next;
  }, [setSettingsState, store]);

  const setSettings = useCallback(
    async (
      nextSettings: import("@/data/modules/app/settings").UserSettings,
    ) => {
      const saved = await store.enqueueWrite(
        () => store.app.setSettings(nextSettings),
        { type: "settings-updated" },
      );

      const normalized = normalizeUserSettings(saved.settings);
      setSettingsState(normalized);
      writeUserSettingsToCookie(normalized);
      return normalized;
    },
    [setSettingsState, store],
  );

  const updateSettings = useCallback(
    async (
      updater: (
        currentSettings: import("@/data/modules/app/settings").UserSettings,
      ) => Partial<import("@/data/modules/app/settings").UserSettings>,
    ) => {
      const saved = await store.enqueueWrite(
        () => store.app.updateSettings(updater),
        { type: "settings-updated" },
      );

      const normalized = normalizeUserSettings(saved.settings);
      setSettingsState(normalized);
      writeUserSettingsToCookie(normalized);
      return normalized;
    },
    [setSettingsState, store],
  );

  const resetSettings = useCallback(async () => {
    const reset = createInitialUserSettings();
    return setSettings(reset);
  }, [setSettings]);

  return useMemo(
    () => ({
      settings,
      isHydrating,
      setSettings,
      updateSettings,
      resetSettings,
      reloadSettings,
    }),
    [
      settings,
      isHydrating,
      setSettings,
      updateSettings,
      resetSettings,
      reloadSettings,
    ],
  );
}

export type { UserSettings } from "@/data/modules/app/settings";
