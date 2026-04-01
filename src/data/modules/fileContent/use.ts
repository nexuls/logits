"use client";

import { useCallback, useMemo } from "react";
import { useDataStore } from "../../context";

export function useFileContentModule() {
  const { store, isHydrating } = useDataStore();

  const getById = useCallback(
    async (fileId: string) => {
      return store.fileContent.getById(fileId);
    },
    [store],
  );

  const upsert = useCallback(
    async (fileId: string, content: string) => {
      return store.fileContent.upsert(fileId, content);
    },
    [store],
  );

  return useMemo(
    () => ({
      isHydrating,
      getById,
      upsert,
    }),
    [isHydrating, getById, upsert],
  );
}
