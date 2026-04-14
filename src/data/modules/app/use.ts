"use client";

import { useCallback, useMemo } from "react";
import { useDataStore } from "../../context";
import { normalizeUserSettings, type UserSettings } from "./settings";

export function useAppModule() {
  const { store, isHydrating } = useDataStore();

  const getSettings = useCallback(async () => {
    return store.app.getSettings();
  }, [store]);

  const setSettings = useCallback(
    async (settings: UserSettings) => {
      const result = await store.app.setSettings(settings);
      return normalizeUserSettings(result.record.settings);
    },
    [store],
  );

  const updateSettings = useCallback(
    async (
      updater: (currentSettings: UserSettings) => Partial<UserSettings>,
    ) => {
      const result = await store.app.updateSettings(updater);
      return normalizeUserSettings(result.record.settings);
    },
    [store],
  );

  return useMemo(
    () => ({
      isHydrating,
      getSettings,
      setSettings,
      updateSettings,
    }),
    [isHydrating, getSettings, setSettings, updateSettings],
  );
}
