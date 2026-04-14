import { z } from "zod";
import { COLOR_SCHEMES } from "@/color-schemes";
import {
  createLocalFontValue,
  DEFAULT_INTERFACE_FONT,
  DEFAULT_MONOSPACE_FONT,
  DEFAULT_TEXT_FONT,
  interfaceFontOptions,
  interfaceFontValues,
  isLocalFontValue,
  monospaceFontOptions,
  monospaceFontValues,
  parseLocalFontValue,
  resolveInterfaceFontFamily,
  resolveMonospaceFontFamily,
  resolveTextFontFamily,
  textFontOptions,
  textFontValues,
  type InterfaceFontKey,
  type LocalFontCategory,
  type LocalFontValue,
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

export type { LocalFontCategory };

type BuiltInInterfaceFont = InterfaceFontKey;
type BuiltInTextFont = TextFontKey;
type BuiltInMonospaceFont = MonospaceFontKey;

export type AppearanceInterfaceFont = BuiltInInterfaceFont | LocalFontValue;
export type AppearanceTextFont = BuiltInTextFont | LocalFontValue;
export type AppearanceMonospaceFont = BuiltInMonospaceFont | LocalFontValue;

export const appearanceInterfaceFontValues = interfaceFontValues;
export const appearanceTextFontValues = textFontValues;
export const appearanceMonospaceFontValues = monospaceFontValues;

export const appearanceInterfaceFontOptions =
  interfaceFontOptions as AppearanceFontOption[];
export const appearanceTextFontOptions =
  textFontOptions as AppearanceFontOption[];
export const appearanceMonospaceFontOptions =
  monospaceFontOptions as AppearanceFontOption[];

export function isAppearanceInterfaceFont(
  value: string,
): value is AppearanceInterfaceFont {
  if (appearanceInterfaceFontValues.includes(value as BuiltInInterfaceFont)) {
    return true;
  }

  if (!isLocalFontValue(value)) return false;

  const parsed = parseLocalFontValue(value);

  return parsed?.category === "sans" || parsed?.category === "serif";
}

export function isAppearanceTextFont(
  value: string,
): value is AppearanceTextFont {
  if (appearanceTextFontValues.includes(value as BuiltInTextFont)) return true;

  if (!isLocalFontValue(value)) return false;

  return parseLocalFontValue(value) !== null;
}

export function isAppearanceMonospaceFont(
  value: string,
): value is AppearanceMonospaceFont {
  if (appearanceMonospaceFontValues.includes(value as BuiltInMonospaceFont)) {
    return true;
  }

  if (!isLocalFontValue(value)) return false;

  const parsed = parseLocalFontValue(value);

  return parsed?.category === "monospace";
}

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
  createLocalFontValue,
  isLocalFontValue,
  parseLocalFontValue,
  appearanceInterfaceFontOptions as interfaceFontOptions,
  appearanceMonospaceFontOptions as monospaceFontOptions,
  appearanceTextFontOptions as textFontOptions,
};

const appearanceSettingsSchema = z.object({
  theme: z.enum(appearanceThemeValues).optional(),
  colorScheme: z.enum(COLOR_SCHEMES).optional(),
  fontSize: z
    .number()
    .min(APPEARANCE_FONT_SCALE_MIN)
    .max(APPEARANCE_FONT_SCALE_MAX)
    .optional(),
  interfaceFont: z
    .custom<AppearanceInterfaceFont>(
      (value): value is AppearanceInterfaceFont =>
        typeof value === "string" && isAppearanceInterfaceFont(value),
    )
    .optional(),
  textFont: z
    .custom<AppearanceTextFont>(
      (value): value is AppearanceTextFont =>
        typeof value === "string" && isAppearanceTextFont(value),
    )
    .optional(),
  monospaceFont: z
    .custom<AppearanceMonospaceFont>(
      (value): value is AppearanceMonospaceFont =>
        typeof value === "string" && isAppearanceMonospaceFont(value),
    )
    .optional(),
  sidebarPosition: z.enum(["left", "right"]).optional(),
  sidebarWidth: z.number().int().positive().optional(),
});

export const userSettingsSchema = z.object({
  appearance: appearanceSettingsSchema.optional(),
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

export function areUserSettingsEqual(left: UserSettings, right: UserSettings) {
  return (
    JSON.stringify(normalizeUserSettings(left)) ===
    JSON.stringify(normalizeUserSettings(right))
  );
}
