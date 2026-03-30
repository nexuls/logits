import type { Extension } from "@codemirror/state";
import { createTheme } from "@uiw/codemirror-themes";
import { StyleModule } from "style-mod";
import { CATPPUCCIN_COLOR_SCHEME } from "@/color-schemes/catppuccin";
import { GITHUB_COLOR_SCHEME } from "@/color-schemes/github";
import { LOGITS_COLOR_SCHEME } from "@/color-schemes/logits";
import { MATERIAL_COLOR_SCHEME } from "@/color-schemes/material";
import type {
  ColorSchemeCssVariables,
  ColorSchemeDefinition,
} from "@/color-schemes/types";

export type ResolvedAppearanceMode = "light" | "dark";

const COLOR_SCHEME_MAP = {
  logits: LOGITS_COLOR_SCHEME,
  github: GITHUB_COLOR_SCHEME,
  material: MATERIAL_COLOR_SCHEME,
  catppuccin: CATPPUCCIN_COLOR_SCHEME,
} as const satisfies Record<string, ColorSchemeDefinition>;

export const COLOR_SCHEMES = Object.keys(
  COLOR_SCHEME_MAP,
) as (keyof typeof COLOR_SCHEME_MAP)[];

export type ColorSchemeName = (typeof COLOR_SCHEMES)[number];

export const DEFAULT_COLOR_SCHEME: ColorSchemeName = "logits";

export function getColorSchemeClassName(
  colorScheme: ColorSchemeName | undefined,
  mode: ResolvedAppearanceMode,
) {
  const normalizedColorScheme = colorScheme ?? DEFAULT_COLOR_SCHEME;
  return `${normalizedColorScheme}-${mode}`;
}

export const ALL_COLOR_SCHEME_CLASSES = COLOR_SCHEMES.flatMap((scheme) => [
  getColorSchemeClassName(scheme, "light"),
  getColorSchemeClassName(scheme, "dark"),
]);

function getColorSchemeDefinition(colorScheme: ColorSchemeName | undefined) {
  return COLOR_SCHEME_MAP[colorScheme ?? DEFAULT_COLOR_SCHEME];
}

function getCssVariablesForMode(
  colorScheme: ColorSchemeName | undefined,
  mode: ResolvedAppearanceMode,
) {
  return getColorSchemeDefinition(colorScheme)[mode].cssVariables;
}

function escapeCssValue(value: string) {
  return value.replace(/[\\\n\r]/g, " ").trim();
}

function serializeCssVariables(cssVariables: ColorSchemeCssVariables) {
  return Object.entries(cssVariables)
    .map(([variable, value]) => `${variable}: ${escapeCssValue(value)};`)
    .join("\n");
}

type StyleModuleSpec = Record<string, Record<string, string>>;

function getStyleModuleSpec(): StyleModuleSpec {
  const spec: StyleModuleSpec = {};

  for (const scheme of COLOR_SCHEMES) {
    spec[`.${getColorSchemeClassName(scheme, "light")}`] =
      getCssVariablesForMode(scheme, "light");
    spec[`.${getColorSchemeClassName(scheme, "dark")}`] =
      getCssVariablesForMode(scheme, "dark");
  }

  return spec;
}

let colorSchemeStyleModule: StyleModule | undefined;

export function ensureColorSchemeStylesMounted() {
  if (typeof document === "undefined") return;
  if (colorSchemeStyleModule) return;

  colorSchemeStyleModule = new StyleModule(getStyleModuleSpec());
  StyleModule.mount(document, colorSchemeStyleModule);
}

export function getColorSchemeStylesheetText() {
  return COLOR_SCHEMES.map((scheme) => {
    const lightClassName = getColorSchemeClassName(scheme, "light");
    const darkClassName = getColorSchemeClassName(scheme, "dark");

    return [
      `.${lightClassName} {`,
      serializeCssVariables(getCssVariablesForMode(scheme, "light")),
      "}",
      `.${darkClassName} {`,
      serializeCssVariables(getCssVariablesForMode(scheme, "dark")),
      "}",
    ].join("\n");
  }).join("\n");
}

const codeMirrorThemeCache = new Map<string, Extension>();

export function getCodeMirrorTheme(
  colorScheme: ColorSchemeName | undefined,
  mode: ResolvedAppearanceMode,
): Extension {
  const normalizedColorScheme = colorScheme ?? DEFAULT_COLOR_SCHEME;
  const cacheKey = `${normalizedColorScheme}-${mode}`;
  const cached = codeMirrorThemeCache.get(cacheKey);
  if (cached) return cached;

  const { codeMirror } = getColorSchemeDefinition(normalizedColorScheme)[mode];

  const extension: Extension = createTheme({
    theme: mode,
    settings: codeMirror.settings,
    styles: codeMirror.styles,
  });

  codeMirrorThemeCache.set(cacheKey, extension);
  return extension;
}
