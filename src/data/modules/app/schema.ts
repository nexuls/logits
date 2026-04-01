import { z } from "zod";
import { userSettingsSchema } from "./settings";

export const appRecordId = "singleton";

export const appRecordSchema = z.object({
  id: z.literal(appRecordId),
  settings: userSettingsSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type AppRecord = z.infer<typeof appRecordSchema>;
