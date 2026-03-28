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
import type { T_App_Data } from "@/types/types";
import { readAppData, writeAppData } from "@/data/store";

type DataContextValue = {
  data: T_App_Data;
  isHydrating: boolean;
  setData: (nextData: T_App_Data) => Promise<T_App_Data>;
  updateData: (
    updater: (currentData: T_App_Data) => T_App_Data,
  ) => Promise<T_App_Data>;
  reloadData: () => Promise<void>;
};

const DataContext = createContext<DataContextValue | null>(null);

const emptyData: T_App_Data = {
  notebooks: [],
  files: [],
  settings: {},
  version: 1,
  updatedAt: new Date().toISOString(),
};

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setDataState] = useState<T_App_Data>(emptyData);
  const [isHydrating, setIsHydrating] = useState(true);
  const dataRef = useRef<T_App_Data>(emptyData);

  const reloadData = useCallback(async () => {
    const nextData = await readAppData();
    dataRef.current = nextData;
    setDataState(nextData);
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  const setData = useCallback(async (nextData: T_App_Data) => {
    const savedData = await writeAppData(nextData);
    dataRef.current = savedData;
    setDataState(savedData);
    return savedData;
  }, []);

  const updateData = useCallback(
    async (updater: (currentData: T_App_Data) => T_App_Data) => {
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
