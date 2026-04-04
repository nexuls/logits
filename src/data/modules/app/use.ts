"use client";

import { useCallback, useMemo } from "react";
import { useDataStore } from "../../context";
import type { UserSettings } from "./settings";

export function useAppModule() {
  const { store, isHydrating } = useDataStore();

  const getSettings = useCallback(async () => {
    return store.app.getSettings();
  }, [store]);

  const setSettings = useCallback(
    async (settings: UserSettings) => {
      return store.app.setSettings(settings);
    },
    [store],
  );

  const updateSettings = useCallback(
    async (
      updater: (currentSettings: UserSettings) => Partial<UserSettings>,
    ) => {
      return store.app.updateSettings(updater);
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
