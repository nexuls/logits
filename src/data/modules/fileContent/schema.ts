import { z } from "zod";

export const fileContentSchema = z.object({
  key: z.string().min(1),
  id: z.string().min(1),
  content: z.string(),
  charCount: z.number().int().nonnegative(),
  lineCount: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export type FileContentRecord = z.infer<typeof fileContentSchema>;
