"use client";

import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import {
  createInitialUserSettings,
  normalizeUserSettings,
  type UserSettings,
} from "@/data/modules/app/settings";
import { writeUserSettingsToCookie } from "@/data/modules/app/cookie";
import type { FileContentRecord } from "@/data/modules/fileContent/schema";
import type { NotebookRecord } from "@/data/modules/notebook/schema";
import { getDataStore, type DataStore } from "./store";

function pruneFileContentCache(
  cache: Map<string, FileContentRecord>,
  notebookRecords: NotebookRecord[],
) {
  const validIds = new Set<string>();

  for (const notebook of notebookRecords) {
    for (const file of notebook.files) {
      validIds.add(file.id);
    }
  }

  const next = new Map<string, FileContentRecord>();

  for (const [fileId, record] of cache) {
    if (validIds.has(fileId)) {
      next.set(fileId, record);
    }
  }

  return next;
}

type DataStoreContextValue = {
  store: DataStore;
  isHydrating: boolean;
  initialSettings: UserSettings;
  notebookRecords: NotebookRecord[];
  fileContents: Map<string, FileContentRecord>;
  settings: UserSettings;
  setNotebookRecords: Dispatch<SetStateAction<NotebookRecord[]>>;
  setFileContents: Dispatch<SetStateAction<Map<string, FileContentRecord>>>;
  setSettingsState: Dispatch<SetStateAction<UserSettings>>;
};

const DataStoreContext = createContext<DataStoreContextValue | null>(null);

export function DataStoreProvider({
  children,
  initialSettings,
}: {
  children: ReactNode;
  initialSettings?: UserSettings;
}) {
  const store = useMemo(() => getDataStore(), []);
  const normalizedInitialSettings = useMemo(
    () => normalizeUserSettings(initialSettings ?? createInitialUserSettings()),
    [initialSettings],
  );
  const [isHydrating, setIsHydrating] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [notebookRecords, setNotebookRecords] = useState<NotebookRecord[]>([]);
  const [fileContents, setFileContents] = useState<Map<string, FileContentRecord>>(
    new Map(),
  );
  const [settings, setSettingsState] = useState<UserSettings>(
    normalizedInitialSettings,
  );

  const reloadNotebooks = useCallback(async () => {
    const nextNotebooks = await store.listNotebooks();

    setNotebookRecords(nextNotebooks);
    setFileContents((current) => pruneFileContentCache(current, nextNotebooks));
  }, [store]);

  const reloadSettings = useCallback(async () => {
    const next = await store.app.getSettings();
    setSettingsState(next);
    writeUserSettingsToCookie(next);
    return next;
  }, [store]);

  useEffect(() => {
    setSettingsState(normalizedInitialSettings);
    writeUserSettingsToCookie(normalizedInitialSettings);
  }, [normalizedInitialSettings]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        await store.initialize();
        await Promise.all([reloadNotebooks(), reloadSettings()]);
      } catch (error: unknown) {
        console.error("[data-context] failed to initialize modular store", error);
      } finally {
        if (isMounted) {
          setIsDataLoading(false);
          setIsHydrating(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [reloadNotebooks, reloadSettings, store]);

  useEffect(() => {
    return store.subscribe((event) => {
      if (event.type === "structure-changed") {
        void reloadNotebooks();
        return;
      }

      if (event.type === "settings-updated") {
        void reloadSettings();
        return;
      }

      if (event.type === "file-content-updated") {
        const { notebookId, fileId } = event;

        void (async () => {
          const notebook = await store.getNotebookById(notebookId);

          if (notebook) {
            setNotebookRecords((current) =>
              current.map((item) => (item.id === notebookId ? notebook : item)),
            );
          }

          const contentRecord = await store.fileContent.getById(fileId);
          if (!contentRecord) return;

          setFileContents((current) => {
            const next = new Map(current);
            next.set(fileId, contentRecord);
            return next;
          });
        })();
      }
    });
  }, [reloadNotebooks, reloadSettings, store]);

  const value = useMemo(
    () => ({
      store,
      isHydrating: isHydrating || isDataLoading,
      initialSettings: normalizedInitialSettings,
      notebookRecords,
      fileContents,
      settings,
      setNotebookRecords,
      setFileContents,
      setSettingsState,
    }),
    [
      store,
      isHydrating,
      isDataLoading,
      normalizedInitialSettings,
      notebookRecords,
      fileContents,
      settings,
    ],
  );

  return createElement(DataStoreContext.Provider, { value }, children);
}

export function useDataStore() {
  const context = useContext(DataStoreContext);

  if (!context) {
    throw new Error("useDataStore must be used inside DataStoreProvider");
  }

  return context;
}
