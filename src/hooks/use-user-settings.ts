"use client";

import { useMemo } from "react";
import { useSettings } from "@/components/providers/data";

export function useUserSettings() {
  const {
    settings,
    isHydrating,
    setSettings,
    updateSettings,
    resetSettings,
    reloadSettings,
  } = useSettings();

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
