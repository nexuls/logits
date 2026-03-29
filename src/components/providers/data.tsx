"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppData, UserSettings } from "@/data/schema";
import {
  createInitialUserSettings,
  normalizeUserSettings,
} from "@/data/schema";
import {
  mergeUserSettings,
  resetUserSettings as resetStoredUserSettings,
  setUserSettings as setStoredUserSettings,
  updateUserSettings as updateStoredUserSettings,
} from "@/data/settings";
import { readAppData, writeAppData } from "@/data/store";
import { writeUserSettingsToCookie } from "@/data/settings-cookie";

type DataContextValue = {
  data: AppData;
  isHydrating: boolean;
  setData: (nextData: AppData) => Promise<AppData>;
  updateData: (updater: (currentData: AppData) => AppData) => Promise<AppData>;
  reloadData: () => Promise<void>;
};

type SettingsContextValue = {
  settings: UserSettings;
  isHydrating: boolean;
  setSettings: (nextSettings: UserSettings) => Promise<UserSettings>;
  updateSettings: (
    updater: (currentSettings: UserSettings) => Partial<UserSettings>,
  ) => Promise<UserSettings>;
  resetSettings: () => Promise<UserSettings>;
  reloadSettings: () => Promise<UserSettings>;
};

const DataContext = createContext<DataContextValue | null>(null);
const SettingsContext = createContext<SettingsContextValue | null>(null);

function createEmptyData(initialSettings: UserSettings): AppData {
  return {
    notebooks: [],
    files: [],
    settings: normalizeUserSettings(initialSettings),
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

function areSettingsEqual(first: UserSettings, second: UserSettings) {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function DataProvider({
  children,
  initialSettings = createInitialUserSettings(),
}: {
  children: ReactNode;
  initialSettings?: UserSettings;
}) {
  const normalizedInitialSettings = useMemo(
    () => normalizeUserSettings(initialSettings),
    [initialSettings],
  );
  const [data, setDataState] = useState<AppData>(() =>
    createEmptyData(normalizedInitialSettings),
  );
  const [isHydrating, setIsHydrating] = useState(true);
  const dataRef = useRef<AppData>(createEmptyData(normalizedInitialSettings));
  const initialSettingsRef = useRef<UserSettings>(normalizedInitialSettings);

  useEffect(() => {
    initialSettingsRef.current = normalizedInitialSettings;
  }, [normalizedInitialSettings]);

  const setData = useCallback(async (nextData: AppData) => {
    const savedData = await writeAppData(nextData);
    dataRef.current = savedData;
    initialSettingsRef.current = normalizeUserSettings(savedData.settings);
    setDataState(savedData);
    return savedData;
  }, []);

  const updateData = useCallback(
    async (updater: (currentData: AppData) => AppData) => {
      const nextData = updater(dataRef.current);
      return setData(nextData);
    },
    [setData],
  );

  const reloadData = useCallback(async () => {
    const storedData = await readAppData();
    const mergedSettings = mergeUserSettings(
      storedData.settings,
      initialSettingsRef.current,
    );
    const nextData = areSettingsEqual(mergedSettings, storedData.settings)
      ? storedData
      : await writeAppData({
          ...storedData,
          settings: mergedSettings,
        });

    dataRef.current = nextData;
    initialSettingsRef.current = normalizeUserSettings(nextData.settings);
    setDataState(nextData);
    writeUserSettingsToCookie(nextData.settings);
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  const setSettings = useCallback(
    async (nextSettings: UserSettings) => {
      const savedData = await updateData((currentData) =>
        setStoredUserSettings(currentData, nextSettings),
      );
      const savedSettings = normalizeUserSettings(savedData.settings);
      initialSettingsRef.current = savedSettings;
      writeUserSettingsToCookie(savedSettings);
      return savedSettings;
    },
    [updateData],
  );

  const updateSettings = useCallback(
    async (updater: (currentSettings: UserSettings) => Partial<UserSettings>) => {
      const savedData = await updateData((currentData) =>
        updateStoredUserSettings(
          currentData,
          updater(normalizeUserSettings(currentData.settings)),
        ),
      );
      const savedSettings = normalizeUserSettings(savedData.settings);
      initialSettingsRef.current = savedSettings;
      writeUserSettingsToCookie(savedSettings);
      return savedSettings;
    },
    [updateData],
  );

  const resetSettings = useCallback(async () => {
    const savedData = await updateData((currentData) =>
      resetStoredUserSettings(currentData),
    );
    const savedSettings = normalizeUserSettings(savedData.settings);
    initialSettingsRef.current = savedSettings;
    writeUserSettingsToCookie(savedSettings);
    return savedSettings;
  }, [updateData]);

  const reloadSettings = useCallback(async () => {
    await reloadData();
    return normalizeUserSettings(dataRef.current.settings);
  }, [reloadData]);

  const dataValue = useMemo(
    () => ({
      data,
      isHydrating,
      setData,
      updateData,
      reloadData,
    }),
    [data, isHydrating, setData, updateData, reloadData],
  );

  const settingsValue = useMemo(
    () => ({
      settings: normalizeUserSettings(data.settings),
      isHydrating,
      setSettings,
      updateSettings,
      resetSettings,
      reloadSettings,
    }),
    [
      data.settings,
      isHydrating,
      setSettings,
      updateSettings,
      resetSettings,
      reloadSettings,
    ],
  );

  return (
    <DataContext.Provider value={dataValue}>
      <SettingsContext.Provider value={settingsValue}>
        {children}
      </SettingsContext.Provider>
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);

  if (!context) {
    throw new Error("useData must be used inside DataProvider");
  }

  return context;
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error("useSettings must be used inside DataProvider");
  }

  return context;
}
