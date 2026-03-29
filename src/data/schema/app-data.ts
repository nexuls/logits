import { z } from "zod";
import { notebookSchema, fileSchema } from "./notebook";
import { userSettingsSchema } from "./settings";

export const appDataSchema = z.object({
  notebooks: z.array(notebookSchema),
  files: z.array(fileSchema),
  settings: userSettingsSchema,
  version: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
});

export type AppData = z.infer<typeof appDataSchema>;

export function createInitialData(): AppData {
  return {
    notebooks: [],
    files: [],
    settings: {},
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeAppData(value: unknown): AppData {
  return appDataSchema.parse(value);
}
