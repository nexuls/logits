import type { TagStyle } from "@codemirror/language";

export type ColorSchemeCssVariables = Record<`--${string}`, string>;

export type ColorSchemeCodeMirrorTheme = {
  settings: {
    background: string;
    foreground: string;
    caret: string;
    selection: string;
    selectionMatch: string;
    lineHighlight: string;
  };
  styles: TagStyle[];
};

export type ColorSchemeModeDefinition = {
  cssVariables: ColorSchemeCssVariables;
  codeMirror: ColorSchemeCodeMirrorTheme;
};

export type ColorSchemeDefinition = {
  light: ColorSchemeModeDefinition;
  dark: ColorSchemeModeDefinition;
};
