import { z } from "zod";
import type { T_App_Data } from "@/types/types";

const notebookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

const fileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  metadata: z.object({
    url: z.string(),
    size: z.number().nonnegative(),
    type: z.enum(["folder", "file", "draw", "image"]),
    parentId: z.string().min(1),
    fileOrder: z.number().int().nonnegative(),
    iconUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    isPublic: z.boolean(),
    isShared: z.boolean(),
    sharedWith: z.array(
      z.object({
        userId: z.string().min(1),
        permission: z.enum(["read", "write"]),
      }),
    ),
    tags: z.array(z.string()),
    enabledFeatures: z.array(
      z.enum(["versioning", "collaboration", "comments", "ai-assistance"]),
    ),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
    createdBy: z.string().min(1),
    updatedBy: z.string().min(1),
  }),
});

export const appDataSchema = z.object({
  notebooks: z.array(notebookSchema),
  files: z.array(fileSchema),
  settings: z.record(z.string(), z.unknown()),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});

export function createInitialData(): T_App_Data {
  return {
    notebooks: [],
    files: [],
    settings: {},
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeAppData(value: unknown): T_App_Data {
  return appDataSchema.parse(value);
}
