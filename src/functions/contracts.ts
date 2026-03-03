/**
 * Defines runtime-validated data contracts for the local data layer.
 *
 * Responsibility:
 * - Provide Zod schemas for metadata snapshots, content records, and queued mutations.
 * - Export inferred TypeScript types used by repositories and providers.
 */
import { z } from "zod";

export const pageMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["canvas", "gallery"]),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  updatedAt: z.string().min(1),
  pages: z.array(pageMetaSchema),
});

export const metadataSnapshotSchema = z.object({
  projects: z.array(projectSchema),
  version: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});

export const pageContentSchema = z.object({
  pageId: z.string().min(1),
  content: z.string(),
  hash: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const mutationSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "project.create",
    "project.duplicate",
    "project.delete",
    "project.pin",
    "project.rename",
    "project.pages.update",
    "content.upsert",
  ]),
  payload: z.unknown(),
  createdAt: z.number().int().nonnegative(),
});

export type MetadataSnapshot = z.infer<typeof metadataSnapshotSchema>;
export type PageContentRecord = z.infer<typeof pageContentSchema>;
export type MutationRecord = z.infer<typeof mutationSchema>;
