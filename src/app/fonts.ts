import { Inter, Geist, Barlow } from "next/font/google";
import { JetBrains_Mono, Geist_Mono } from "next/font/google";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const barlow = Barlow<"--font-barlow">({
  variable: "--font-barlow",
  weight: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type FontLoader = {
  variable?: string;
};

type FontDefinition<TFont extends FontLoader = FontLoader> = {
  font: TFont;
  variableName: `--${string}`;
  label: string;
  family: string;
};

function objectKeys<const T extends Record<string, unknown>>(value: T) {
  return Object.keys(value) as [
    Extract<keyof T, string>,
    ...Extract<keyof T, string>[],
  ];
}

function toFontLabel(value: string) {
  return value
    .split("-")
    .map((chunk) => chunk[0].toUpperCase() + chunk.slice(1))
    .join(" ");
}

function sansFamilyFromVariable(variableName: `--${string}`) {
  return `var(${variableName}), "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
}

function monoFamilyFromVariable(variableName: `--${string}`) {
  return `var(${variableName}), "Cascadia Mono", "SFMono-Regular", Menlo, Consolas, monospace`;
}

export const interfaceFonts = {
  inter: {
    font: inter,
    variableName: "--font-inter",
    label: "Inter",
    family: sansFamilyFromVariable("--font-inter"),
  },
  geist: {
    font: geistSans,
    variableName: "--font-geist-sans",
    label: "Geist",
    family: sansFamilyFromVariable("--font-geist-sans"),
  },
  barlow: {
    font: barlow,
    variableName: "--font-barlow",
    label: "Barlow",
    family: sansFamilyFromVariable("--font-barlow"),
  },
} as const satisfies Record<string, FontDefinition>;

export const textFonts = interfaceFonts;

export const monospaceFonts = {
  "jetbrains-mono": {
    font: jetBrainsMono,
    variableName: "--font-jetbrains-mono",
    label: "JetBrains Mono",
    family: monoFamilyFromVariable("--font-jetbrains-mono"),
  },
  "geist-mono": {
    font: geistMono,
    variableName: "--font-geist-mono",
    label: "Geist Mono",
    family: monoFamilyFromVariable("--font-geist-mono"),
  },
} as const satisfies Record<string, FontDefinition>;

export type InterfaceFontKey = Extract<keyof typeof interfaceFonts, string>;
export type TextFontKey = Extract<keyof typeof textFonts, string>;
export type MonospaceFontKey = Extract<keyof typeof monospaceFonts, string>;

export const interfaceFontValues = objectKeys(interfaceFonts) as [
  InterfaceFontKey,
  ...InterfaceFontKey[],
];
export const textFontValues = objectKeys(textFonts) as [
  TextFontKey,
  ...TextFontKey[],
];
export const monospaceFontValues = objectKeys(monospaceFonts) as [
  MonospaceFontKey,
  ...MonospaceFontKey[],
];

export type FontOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  family: string;
};

export const interfaceFontOptions: FontOption<InterfaceFontKey>[] =
  interfaceFontValues.map((value) => ({
    value,
    label: interfaceFonts[value].label || toFontLabel(value),
    family: interfaceFonts[value].family,
  }));

export const textFontOptions: FontOption<TextFontKey>[] = textFontValues.map(
  (value) => ({
    value,
    label: textFonts[value].label || toFontLabel(value),
    family: textFonts[value].family,
  }),
);

export const monospaceFontOptions: FontOption<MonospaceFontKey>[] =
  monospaceFontValues.map((value) => ({
    value,
    label: monospaceFonts[value].label || toFontLabel(value),
    family: monospaceFonts[value].family,
  }));

export const DEFAULT_INTERFACE_FONT: InterfaceFontKey = interfaceFontValues[0];
export const DEFAULT_TEXT_FONT: TextFontKey = textFontValues[0];
export const DEFAULT_MONOSPACE_FONT: MonospaceFontKey = monospaceFontValues[0];

export function resolveInterfaceFontFamily(value?: InterfaceFontKey) {
  const selected = value ? interfaceFonts[value] : undefined;

  return selected?.family ?? interfaceFonts[DEFAULT_INTERFACE_FONT].family;
}

export function resolveTextFontFamily(value?: TextFontKey) {
  const selected = value ? textFonts[value] : undefined;

  return selected?.family ?? textFonts[DEFAULT_TEXT_FONT].family;
}

export function resolveMonospaceFontFamily(value?: MonospaceFontKey) {
  const selected = value ? monospaceFonts[value] : undefined;

  return selected?.family ?? monospaceFonts[DEFAULT_MONOSPACE_FONT].family;
}

const allFontDefinitions = [
  ...Object.values(interfaceFonts),
  ...Object.values(textFonts),
  ...Object.values(monospaceFonts),
];

export const classNamesForFontVariables = Array.from(
  new Set(
    allFontDefinitions
      .map((definition) => definition.font.variable)
      .filter((value): value is string => Boolean(value)),
  ),
);
