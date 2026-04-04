import type { z } from "zod";

export type TransactionMode = "readonly" | "readwrite";

export type StoreLike = {
  get: (key: IDBValidKey) => Promise<unknown>;
  getAll: () => Promise<unknown[]>;
  put: (value: unknown) => Promise<IDBValidKey>;
  delete: (key: IDBValidKey) => Promise<void>;
};

export type TxLike = {
  objectStore: (storeName: string) => StoreLike;
};

export type DbLike = {
  transaction: (
    storeName: string,
    mode: TransactionMode,
  ) => {
    objectStore: (requestedStoreName: string) => StoreLike;
  };
};

export type ModuleScope = {
  db?: DbLike;
  tx?: unknown;
};

export abstract class DataModule<TRecord> {
  protected constructor(
    protected readonly storeName: string,
    protected readonly parser: z.ZodType<TRecord>,
    protected readonly getDb: () => Promise<DbLike>,
  ) {}

  protected parse(value: unknown): TRecord {
    return this.parser.parse(value);
  }

  protected async resolveStore(scope?: ModuleScope) {
    const fromScope = scope?.tx as TxLike | undefined;

    if (fromScope) {
      return {
        store: fromScope.objectStore(this.storeName),
        tx: fromScope,
      };
    }

    const db = scope?.db ?? (await this.getDb());

    return {
      store: db
        .transaction(this.storeName, "readwrite")
        .objectStore(this.storeName),
      tx: null,
    };
  }

  protected async readRecord(
    key: IDBValidKey,
    scope?: ModuleScope,
  ): Promise<TRecord | null> {
    const { store } = await this.resolveStore(scope);
    const record = await store.get(key);
    if (!record) return null;
    return this.parse(record);
  }

  protected async readAllRecords(scope?: ModuleScope): Promise<TRecord[]> {
    const { store } = await this.resolveStore(scope);
    const records = await store.getAll();
    return records.map((record: unknown) => this.parse(record));
  }

  protected async saveRecord(
    record: TRecord,
    scope?: ModuleScope,
  ): Promise<TRecord> {
    const parsed = this.parse(record);
    const { store } = await this.resolveStore(scope);
    await store.put(parsed);
    return parsed;
  }

  protected async removeRecord(
    key: IDBValidKey,
    scope?: ModuleScope,
  ): Promise<void> {
    const { store } = await this.resolveStore(scope);
    await store.delete(key);
  }
}
