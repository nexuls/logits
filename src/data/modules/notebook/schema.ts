import { z } from "zod";

export const notebookFileTypeSchema = z.enum([
  "folder",
  "file",
  "draw",
  "image",
]);

export const notebookFileFeatureSchema = z.enum([
  "versioning",
  "collaboration",
  "comments",
  "ai-assistance",
]);

export const notebookFileSharedWithSchema = z.object({
  userId: z.string().min(1),
  permission: z.enum(["read", "write"]),
});

export const notebookFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: notebookFileTypeSchema,
  parentId: z.string().min(1),
  order: z.number().int().nonnegative(),
  url: z.string(),
  size: z.number().nonnegative(),
  isPublic: z.boolean(),
  isShared: z.boolean(),
  sharedWith: z.array(notebookFileSharedWithSchema),
  tags: z.array(z.string()),
  enabledFeatures: z.array(notebookFileFeatureSchema),
  iconUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const notebookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  files: z.array(notebookFileSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

export type NotebookFileType = z.infer<typeof notebookFileTypeSchema>;
export type NotebookFileFeature = z.infer<typeof notebookFileFeatureSchema>;
export type NotebookFileSharedWith = z.infer<
  typeof notebookFileSharedWithSchema
>;
export type NotebookFile = z.infer<typeof notebookFileSchema>;
export type NotebookRecord = z.infer<typeof notebookSchema>;
