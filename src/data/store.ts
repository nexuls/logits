import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { AppData } from "@/data/schema";
import { createInitialData, normalizeAppData } from "./schema";

type AppStoreRecord = {
  key: "root";
  data: AppData;
};

interface AppDbSchema extends DBSchema {
  app: {
    key: string;
    value: AppStoreRecord;
  };
}

const DB_NAME = "logits";
const DB_VERSION = 1;
const STORE_NAME = "app";
const ROOT_KEY = "root";

let dbPromise: Promise<IDBPDatabase<AppDbSchema>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AppDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      },
    });
  }

  return dbPromise;
}

export async function readAppData() {
  try {
    const db = await getDb();
    const record = await db.get(STORE_NAME, ROOT_KEY);

    if (!record) {
      const initialData = createInitialData();
      await writeAppData(initialData);
      return initialData;
    }

    return normalizeAppData(record.data);
  } catch (error) {
    console.error("[store] failed reading app data from IndexedDB", error);
    throw error;
  }
}

export async function writeAppData(data: AppData) {
  try {
    const db = await getDb();
    const normalized = normalizeAppData(data);

    await db.put(STORE_NAME, {
      key: ROOT_KEY,
      data: normalized,
    });

    return normalized;
  } catch (error) {
    console.error("[store] failed writing app data to IndexedDB", error);
    throw error;
  }
}
