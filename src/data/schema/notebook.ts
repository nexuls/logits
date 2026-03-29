import { z } from "zod";

export const notebookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const fileTypeSchema = z.enum(["folder", "file", "draw", "image"]);

export const fileFeatureSchema = z.enum([
  "versioning",
  "collaboration",
  "comments",
  "ai-assistance",
]);

export const fileSharedWithSchema = z.object({
  userId: z.string().min(1),
  permission: z.enum(["read", "write"]),
});

export const fileMetadataSchema = z.object({
  url: z.string(),
  size: z.number().nonnegative(),
  type: fileTypeSchema,
  parentId: z.string().min(1),

  // Miscellaneous
  fileOrder: z.number().int().nonnegative(),
  iconUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),

  // Sharing and permissions
  isPublic: z.boolean(),
  isShared: z.boolean(),
  sharedWith: z.array(fileSharedWithSchema),
  tags: z.array(z.string()),
  enabledFeatures: z.array(fileFeatureSchema),

  // Auditing fields
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  createdBy: z.string().min(1),
  updatedBy: z.string().min(1),
});

export const fileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  metadata: fileMetadataSchema,
});

export type Notebook = z.infer<typeof notebookSchema>;
export type FileType = z.infer<typeof fileTypeSchema>;
export type FileFeature = z.infer<typeof fileFeatureSchema>;
export type FileSharedWith = z.infer<typeof fileSharedWithSchema>;
export type FileMetadata = z.infer<typeof fileMetadataSchema>;
export type AppFile = z.infer<typeof fileSchema>;
