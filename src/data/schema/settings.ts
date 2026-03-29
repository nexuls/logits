import { z } from "zod";

const AppearanceSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  colorScheme: z.enum(["github", "material", "catppuccin"]).optional(),
  fontSize: z.enum(["small", "medium", "large"]).optional(),

  // Workspace layout
  sidebarPosition: z.enum(["left", "right"]).optional(),
  sidebarWidth: z.number().int().positive().optional(),
});

export const userSettingsSchema = z.object({
  appearance: AppearanceSettingsSchema.optional(),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

export function createInitialUserSettings(): UserSettings {
  return {};
}

export function normalizeUserSettings(value: unknown): UserSettings {
  const parsed = userSettingsSchema.parse(value ?? {});

  if (!parsed.appearance || Object.keys(parsed.appearance).length > 0) {
    return parsed;
  }

  return {};
}
