import {
  isLocalFontValue,
  parseLocalFontValue,
  type AppearanceColorScheme,
  type AppearanceTheme,
  type LocalFontCategory,
} from "@/data/modules/app/settings";
import type { LocalFontOptionsResult } from "@/lib/local-fonts";

export const themes: { value: AppearanceTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Adapt to system" },
];

export function colorSchemeLabel(value: AppearanceColorScheme) {
  if (value === "catppuccin") return "Catppuccin";

  return value[0].toUpperCase() + value.slice(1);
}

export function localCategoryLabel(category: LocalFontCategory) {
  if (category === "monospace") return "mono";

  return category;
}

export function withSelectedLocalFont(
  options:
    | LocalFontOptionsResult["nonMonospace"]
    | LocalFontOptionsResult["monospace"],
  selected: string,
) {
  if (!isLocalFontValue(selected)) return options;

  if (options.some((option) => option.value === selected)) return options;

  const parsed = parseLocalFontValue(selected);

  if (!parsed) return options;

  return [
    {
      value: selected,
      label: parsed.family,
      family: parsed.family,
      category: parsed.category,
    },
    ...options,
  ];
}
