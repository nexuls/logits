/**
 * Encapsulates IndexedDB initialization and schema configuration.
 *
 * Responsibility:
 * - Open and upgrade the local `logits-cache` database.
 * - Define object stores used by metadata, content, sync state, and mutation queue.
 * - Expose a shared database connection promise for repository modules.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  MetadataSnapshot,
  MutationRecord,
  PageContentRecord,
} from "./contracts";

type MetadataStoreValue = {
  key: "global";
  snapshot: MetadataSnapshot;
  hash: string;
  updatedAt: string;
};

type SyncStoreValue = {
  key: string;
  value: string;
  updatedAt: string;
};

interface LogitsDbSchema extends DBSchema {
  metadata: {
    key: string;
    value: MetadataStoreValue;
  };
  content: {
    key: string;
    value: PageContentRecord;
  };
  mutations: {
    key: string;
    value: MutationRecord;
  };
  sync: {
    key: string;
    value: SyncStoreValue;
  };
}

const DB_NAME = "logits-cache";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<LogitsDbSchema>> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<LogitsDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("metadata")) {
          database.createObjectStore("metadata", { keyPath: "key" });
        }

        if (!database.objectStoreNames.contains("content")) {
          database.createObjectStore("content", { keyPath: "pageId" });
        }

        if (!database.objectStoreNames.contains("mutations")) {
          database.createObjectStore("mutations", { keyPath: "id" });
        }

        if (!database.objectStoreNames.contains("sync")) {
          database.createObjectStore("sync", { keyPath: "key" });
        }
      },
    });
  }

  return dbPromise;
}
