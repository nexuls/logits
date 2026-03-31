import {
  createLocalFontValue,
  type LocalFontCategory,
  type LocalFontValue,
} from "@/app/fonts";

type WindowWithLocalFonts = Window & {
  queryLocalFonts?: () => Promise<Array<{ family: string }>>;
};

type LocalFontOption = {
  value: LocalFontValue;
  label: string;
  family: string;
  category: LocalFontCategory;
};

export type LocalFontOptionsResult = {
  available: boolean;
  nonMonospace: LocalFontOption[];
  monospace: LocalFontOption[];
};

const SERIF_HINTS = [
  "serif",
  "times",
  "garamond",
  "georgia",
  "baskerville",
  "cambria",
  "didot",
  "bodoni",
  "palatino",
  "bookman",
  "constantia",
];

const MONOSPACE_HINTS = [
  "mono",
  "code",
  "consolas",
  "courier",
  "menlo",
  "monaco",
  "cascadia",
  "fixed",
  "terminal",
  "inconsolata",
  "source code",
];

function quoteFontFamily(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function likelyMonospaceFromName(family: string) {
  const normalized = family.toLowerCase();

  return MONOSPACE_HINTS.some((hint) => normalized.includes(hint));
}

function likelySerifFromName(family: string) {
  const normalized = family.toLowerCase();

  return SERIF_HINTS.some((hint) => normalized.includes(hint));
}

function likelyMonospaceFromMetrics(family: string) {
  if (typeof document === "undefined") return false;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) return false;

  context.font = `16px ${quoteFontFamily(family)}, monospace`;

  const narrow = context.measureText("iiiiiiiiii").width;
  const wide = context.measureText("WWWWWWWWWW").width;

  return Math.abs(narrow - wide) < 1;
}

function classifyLocalFont(family: string): LocalFontCategory {
  if (likelyMonospaceFromName(family) || likelyMonospaceFromMetrics(family)) {
    return "monospace";
  }

  return likelySerifFromName(family) ? "serif" : "sans";
}

function sortOptions(options: LocalFontOption[]) {
  return options.toSorted((a, b) => a.label.localeCompare(b.label));
}

function toLocalFontOption(family: string): LocalFontOption {
  const category = classifyLocalFont(family);

  return {
    value: createLocalFontValue(family, category),
    label: family,
    family,
    category,
  };
}

export async function getLocalFontOptions(): Promise<LocalFontOptionsResult> {
  if (typeof window === "undefined") {
    return {
      available: false,
      nonMonospace: [],
      monospace: [],
    };
  }

  const localFontApi = (window as WindowWithLocalFonts).queryLocalFonts;

  if (!localFontApi) {
    console.warn("Local font API not available");

    return {
      available: false,
      nonMonospace: [],
      monospace: [],
    };
  }

  try {
    const fonts = await localFontApi();
    const families = Array.from(
      new Set(
        fonts
          .map((font) => font.family?.trim())
          .filter((family): family is string => Boolean(family)),
      ),
    );

    const options = families.map(toLocalFontOption);

    return {
      available: true,
      nonMonospace: sortOptions(
        options.filter((option) => option.category !== "monospace"),
      ),
      monospace: sortOptions(
        options.filter((option) => option.category === "monospace"),
      ),
    };
  } catch {
    console.error("Error fetching local fonts");

    return {
      available: false,
      nonMonospace: [],
      monospace: [],
    };
  }
}
