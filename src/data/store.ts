import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { DbLike } from "./dataModule";
import { AppModule } from "./modules/app/functions";
import type { AppRecord } from "./modules/app/schema";
import { FileContentModule } from "./modules/fileContent/functions";
import type { FileContentRecord } from "./modules/fileContent/schema";
import {
  cloneImportedNotebookBundle,
  notebookFromJson,
  NotebookModule,
} from "./modules/notebook/functions";
import type {
  NotebookFileType,
  NotebookRecord,
} from "./modules/notebook/schema";

export type MetaRecord = {
  key: string;
  value: string;
  updatedAt: string;
};

export interface LogitsDbSchema extends DBSchema {
  appPreferences: {
    key: string;
    value: AppRecord;
  };
  notebooks: {
    key: string;
    value: NotebookRecord;
  };
  fileContents: {
    key: string;
    value: FileContentRecord;
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

export type DataStoreEvent =
  | { type: "structure-changed" }
  | { type: "settings-updated" }
  | { type: "file-content-updated"; notebookId: string; fileId: string };

const DB_NAME = "logits";
const DB_VERSION = 3;

type StoreName = "appPreferences" | "notebooks" | "fileContents" | "meta";

let dbPromise: Promise<IDBPDatabase<LogitsDbSchema>> | null = null;

function ensureStore(
  database: IDBPDatabase<LogitsDbSchema>,
  storeName: StoreName,
  keyPath: string,
) {
  if (database.objectStoreNames.contains(storeName)) return;
  database.createObjectStore(storeName, { keyPath });
}

export function getDb(): Promise<IDBPDatabase<LogitsDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<LogitsDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        ensureStore(database, "appPreferences", "id");
        ensureStore(database, "notebooks", "id");
        ensureStore(database, "fileContents", "key");
        ensureStore(database, "meta", "key");
      },
    });
  }

  return dbPromise;
}

export class DataStore {
  readonly app = new AppModule(() => getDb() as unknown as Promise<DbLike>);
  readonly notebook = new NotebookModule(
    () => getDb() as unknown as Promise<DbLike>,
  );
  readonly fileContent = new FileContentModule(
    () => getDb() as unknown as Promise<DbLike>,
  );

  private pendingWritePromise: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(event: DataStoreEvent) => void>();

  subscribe(listener: (event: DataStoreEvent) => void) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(event: DataStoreEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async initialize() {
    (async () => {
      await getDb();
    })();
  }

  async enqueueWrite<T>(
    operation: () => Promise<T>,
    event: DataStoreEvent = { type: "structure-changed" },
  ) {
    const queued = this.pendingWritePromise.then(
      async () => {
        const result = await operation();
        this.notifyListeners(event);
        return result;
      },
      async () => {
        const result = await operation();
        this.notifyListeners(event);
        return result;
      },
    );

    this.pendingWritePromise = queued.catch(() => undefined);
    return queued;
  }

  async listNotebooks() {
    await this.initialize();
    return this.notebook.list();
  }

  async getNotebookById(notebookId: string) {
    await this.initialize();
    return this.notebook.getById(notebookId);
  }

  async createNotebook(name?: string) {
    await this.initialize();
    return this.enqueueWrite(() => this.notebook.create(name));
  }

  async renameNotebook(notebookId: string, name: string) {
    await this.initialize();
    return this.enqueueWrite(() => this.notebook.rename(notebookId, name));
  }

  async importNotebookFromJson(json: string, name?: string) {
    await this.initialize();

    return this.enqueueWrite(async () => {
      const parsed = notebookFromJson(json);
      const imported = cloneImportedNotebookBundle(parsed, { name });
      const db = await getDb();
      const tx = db.transaction(["notebooks", "fileContents"], "readwrite");

      await this.notebook.importRecord(imported.notebook, { tx });

      for (const fileContent of imported.fileContents) {
        await this.fileContent.importRecord(fileContent, { tx });
      }

      await tx.done;
      return imported.notebook;
    });
  }

  async createFileWithInitialContent(input: {
    notebookId: string;
    parentId: string;
    type: NotebookFileType;
    name?: string;
    content?: string;
  }) {
    await this.initialize();

    return this.enqueueWrite(async () => {
      const db = await getDb();
      const tx = db.transaction(["notebooks", "fileContents"], "readwrite");
      const created = await this.notebook.createFile(
        input.notebookId,
        {
          parentId: input.parentId,
          type: input.type,
          name: input.name,
        },
        { tx },
      );

      if (created?.file) {
        await this.fileContent.upsert(created.file.id, input.content ?? "", {
          tx,
        });
      }

      await tx.done;
      return created;
    });
  }

  async updateFileContent(notebookId: string, fileId: string, content: string) {
    await this.initialize();

    return this.enqueueWrite(
      async () => {
        const db = await getDb();
        const tx = db.transaction(["notebooks", "fileContents"], "readwrite");
        await this.fileContent.upsert(fileId, content, { tx });
        await this.notebook.updateFileContentStats(
          notebookId,
          fileId,
          content,
          {
            tx,
          },
        );
        await tx.done;
      },
      { type: "file-content-updated", notebookId, fileId },
    );
  }

  async deleteNotebookCascade(notebookId: string) {
    await this.initialize();

    return this.enqueueWrite(async () => {
      const db = await getDb();
      const tx = db.transaction(["notebooks", "fileContents"], "readwrite");
      const notebook = await this.notebook.getById(notebookId, { tx });

      if (!notebook) {
        await tx.done;
        return null;
      }

      const fileIds = notebook.files.map((file) => file.id);
      await this.notebook.deleteNotebook(notebookId, { tx });
      await this.fileContent.deleteMany(fileIds, { tx });
      await tx.done;

      return notebook;
    });
  }
}

let modularStoreInstance: DataStore | null = null;

export function getDataStore() {
  if (!modularStoreInstance) {
    modularStoreInstance = new DataStore();
  }

  return modularStoreInstance;
}
