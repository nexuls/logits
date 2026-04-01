import { DataModule, type ModuleScope } from "@/data/dataModule";
import type { DbLike } from "@/data/dataModule";
import {
  fileContentSchema,
  type FileContentRecord,
} from "./schema";

function nowIso() {
  return new Date().toISOString();
}

function countLines(content: string) {
  if (content.length === 0) return 0;
  return content.split("\n").length;
}

export class FileContentModule extends DataModule<FileContentRecord> {
  constructor(getDb: () => Promise<DbLike>) {
    super("fileContents", fileContentSchema, getDb);
  }

  async getById(fileId: string, scope?: ModuleScope) {
    return this.readRecord(fileId, scope);
  }

  async list(scope?: ModuleScope) {
    return this.readAllRecords(scope);
  }

  async upsert(fileId: string, content: string, scope?: ModuleScope) {
    const existing = await this.getById(fileId, scope);
    const timestamp = nowIso();
    const next = fileContentSchema.parse({
      key: fileId,
      id: fileId,
      content,
      charCount: content.length,
      lineCount: countLines(content),
      byteSize: new TextEncoder().encode(content).length,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });

    await this.saveRecord(next, scope);
    return next;
  }

  async deleteById(fileId: string, scope?: ModuleScope) {
    await this.removeRecord(fileId, scope);
  }

  async deleteMany(fileIds: string[], scope?: ModuleScope) {
    for (const fileId of fileIds) {
      await this.deleteById(fileId, scope);
    }
  }
}
