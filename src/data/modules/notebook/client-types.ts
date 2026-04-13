import type { NotebookFile, NotebookFileType, NotebookRecord } from "./schema";

export type FileType = NotebookFileType;

export type FileMetadata = {
  url: string;
  size: number;
  type: FileType;
  parentId: string;
  fileOrder: number;
  iconUrl?: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  isShared: boolean;
  sharedWith: {
    userId: string;
    permission: "read" | "write";
  }[];
  tags: string[];
  enabledFeatures: (
    | "versioning"
    | "collaboration"
    | "comments"
    | "ai-assistance"
  )[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
};

export type AppFile = {
  id: string;
  name: string;
  metadata: FileMetadata;
};

export type Notebook = Omit<NotebookRecord, "files">;

export function toClientNotebook(record: NotebookRecord): Notebook {
  return {
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
  };
}

export function toClientFile(file: NotebookFile): AppFile {
  return {
    id: file.id,
    name: file.name,
    metadata: {
      url: file.url,
      size: file.size,
      type: file.type,
      parentId: file.parentId,
      fileOrder: file.order,
      iconUrl: file.iconUrl,
      thumbnailUrl: file.thumbnailUrl,
      isPublic: file.isPublic,
      isShared: file.isShared,
      sharedWith: file.sharedWith,
      tags: file.tags,
      enabledFeatures: file.enabledFeatures,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      createdBy: file.createdBy,
      updatedBy: file.updatedBy,
    },
  };
}
