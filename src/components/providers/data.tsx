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
import type { AppData } from "@/data/schema";
import { readAppData, writeAppData } from "@/data/store";

type DataContextValue = {
  data: AppData;
  isHydrating: boolean;
  setData: (nextData: AppData) => Promise<AppData>;
  updateData: (updater: (currentData: AppData) => AppData) => Promise<AppData>;
  reloadData: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

const emptyData: AppData = {
  notebooks: [],
  files: [],
  settings: {},
  version: 1,
  updatedAt: new Date().toISOString(),
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<AppData>(emptyData);
  const [isHydrating, setIsHydrating] = useState(true);
  const dataRef = useRef<AppData>(emptyData);

  const reloadData = useCallback(async () => {
    const nextData = await readAppData();
    dataRef.current = nextData;
    setDataState(nextData);
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  const setData = useCallback(async (nextData: AppData) => {
    const savedData = await writeAppData(nextData);
    dataRef.current = savedData;
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

  const value = useMemo(
    () => ({
      data,
      isHydrating,
      setData,
      updateData,
      reloadData,
    }),
    [data, isHydrating, setData, updateData, reloadData],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const context = useContext(DataContext);

  if (!context) {
    throw new Error("useData must be used inside DataProvider");
  }

  return context;
}
