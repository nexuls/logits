import type { AppearanceColorScheme } from "@/data/schema";

export const DEFAULT_COLOR_SCHEME: AppearanceColorScheme = "logits";

export const COLOR_SCHEMES = [
  "logits",
  "github",
  "material",
  "catppuccin",
] as const;

export type ResolvedAppearanceMode = "light" | "dark";

export function getColorSchemeClassName(
  colorScheme: AppearanceColorScheme | undefined,
  mode: ResolvedAppearanceMode,
) {
  const normalizedColorScheme = colorScheme ?? DEFAULT_COLOR_SCHEME;
  return `${normalizedColorScheme}-${mode}`;
}

export const ALL_COLOR_SCHEME_CLASSES = COLOR_SCHEMES.flatMap((scheme) => [
  getColorSchemeClassName(scheme, "light"),
  getColorSchemeClassName(scheme, "dark"),
]);
