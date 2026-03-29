import { z } from "zod";
import { COLOR_SCHEMES } from "@/coloe-scheme";
import {
  DEFAULT_INTERFACE_FONT,
  DEFAULT_MONOSPACE_FONT,
  DEFAULT_TEXT_FONT,
  interfaceFontOptions,
  interfaceFontValues,
  monospaceFontOptions,
  monospaceFontValues,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveTextFontFamily,
  textFontOptions,
  textFontValues,
  type InterfaceFontKey,
  type MonospaceFontKey,
  type TextFontKey,
} from "@/app/fonts";

export const appearanceThemeValues = ["light", "dark", "system"] as const;
export type AppearanceTheme = (typeof appearanceThemeValues)[number];

export type AppearanceColorScheme = (typeof COLOR_SCHEMES)[number];

export const APPEARANCE_FONT_SCALE_MIN = 0.8;
export const APPEARANCE_FONT_SCALE_MAX = 1.3;
export const APPEARANCE_FONT_SCALE_STEP = 0.05;
export const APPEARANCE_FONT_SCALE_DEFAULT = 1;

export type AppearanceFontSize = number;

type AppearanceFontOption = {
  value: string;
  label: string;
  family: string;
};

export type AppearanceInterfaceFont = InterfaceFontKey;
export type AppearanceTextFont = TextFontKey;
export type AppearanceMonospaceFont = MonospaceFontKey;

export const appearanceInterfaceFontValues = interfaceFontValues;
export const appearanceTextFontValues = textFontValues;
export const appearanceMonospaceFontValues = monospaceFontValues;

export const appearanceInterfaceFontOptions =
  interfaceFontOptions as AppearanceFontOption[];
export const appearanceTextFontOptions =
  textFontOptions as AppearanceFontOption[];
export const appearanceMonospaceFontOptions =
  monospaceFontOptions as AppearanceFontOption[];

function roundToStep(value: number) {
  return (
    Math.round(value / APPEARANCE_FONT_SCALE_STEP) * APPEARANCE_FONT_SCALE_STEP
  );
}

function clampFontScale(value: number) {
  return Math.min(
    APPEARANCE_FONT_SCALE_MAX,
    Math.max(APPEARANCE_FONT_SCALE_MIN, value),
  );
}

export function normalizeAppearanceFontScale(value: number) {
  return clampFontScale(roundToStep(value));
}

export { DEFAULT_INTERFACE_FONT, DEFAULT_MONOSPACE_FONT, DEFAULT_TEXT_FONT };
export {
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveTextFontFamily,
};
export {
  appearanceInterfaceFontOptions as interfaceFontOptions,
  appearanceMonospaceFontOptions as monospaceFontOptions,
  appearanceTextFontOptions as textFontOptions,
};

const AppearanceSettingsSchema = z.object({
  theme: z.enum(appearanceThemeValues).optional(),
  colorScheme: z.enum(COLOR_SCHEMES).optional(),

  // Fonts
  fontSize: z
    .number()
    .min(APPEARANCE_FONT_SCALE_MIN)
    .max(APPEARANCE_FONT_SCALE_MAX)
    .optional(),
  interfaceFont: z.enum(appearanceInterfaceFontValues).optional(),
  textFont: z.enum(appearanceTextFontValues).optional(),
  monospaceFont: z.enum(appearanceMonospaceFontValues).optional(),

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

  if (parsed.appearance?.fontSize !== undefined) {
    parsed.appearance.fontSize = normalizeAppearanceFontScale(
      parsed.appearance.fontSize,
    );
  }

  if (!parsed.appearance || Object.keys(parsed.appearance).length > 0) {
    return parsed;
  }

  return {};
}
