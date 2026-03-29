import { z } from "zod";
import { COLOR_SCHEMES } from "@/coloe-scheme";

export const appearanceThemeValues = ["light", "dark", "system"] as const;
export type AppearanceTheme = (typeof appearanceThemeValues)[number];

export type AppearanceColorScheme = (typeof COLOR_SCHEMES)[number];

export const appearanceFontSizeValues = ["small", "medium", "large"] as const;
export type AppearanceFontSize = (typeof appearanceFontSizeValues)[number];

const AppearanceSettingsSchema = z.object({
  theme: z.enum(appearanceThemeValues).optional(),
  colorScheme: z.enum(COLOR_SCHEMES).optional(),
  fontSize: z.enum(appearanceFontSizeValues).optional(),

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
