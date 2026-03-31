"use client";

import { useEffect, useMemo, useState } from "react";
import { Paintbrush, PilcrowIcon, SlidersHorizontal } from "lucide-react";
import { COLOR_SCHEMES } from "@/color-schemes";
import type {
  AppearanceColorScheme,
  AppearanceFontSize,
  AppearanceInterfaceFont,
  AppearanceMonospaceFont,
  AppearanceTextFont,
  AppearanceTheme,
  LocalFontCategory,
} from "@/data/schema";
import {
  APPEARANCE_FONT_SCALE_DEFAULT,
  APPEARANCE_FONT_SCALE_MAX,
  APPEARANCE_FONT_SCALE_MIN,
  APPEARANCE_FONT_SCALE_STEP,
  isAppearanceInterfaceFont,
  isAppearanceMonospaceFont,
  isAppearanceTextFont,
  interfaceFontOptions,
  isLocalFontValue,
  monospaceFontOptions,
  normalizeAppearanceFontScale,
  parseLocalFontValue,
  textFontOptions,
} from "@/data/schema";
import {
  getLocalFontOptions,
  type LocalFontOptionsResult,
} from "@/lib/local-fonts";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";

type Props = {
  theme: AppearanceTheme;
  colorScheme: AppearanceColorScheme;
  fontSize: AppearanceFontSize;
  interfaceFont: AppearanceInterfaceFont;
  textFont: AppearanceTextFont;
  monospaceFont: AppearanceMonospaceFont;
  sidebarPosition: "left" | "right";
  onThemeChange: (value: AppearanceTheme) => void;
  onColorSchemeChange: (value: AppearanceColorScheme) => void;
  onFontSizeChange: (value: AppearanceFontSize) => void;
  onInterfaceFontChange: (value: AppearanceInterfaceFont) => void;
  onTextFontChange: (value: AppearanceTextFont) => void;
  onMonospaceFontChange: (value: AppearanceMonospaceFont) => void;
  onSidebarPositionChange: (value: "left" | "right") => void;
};

const themes: { value: AppearanceTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Adapt to system" },
];

function colorSchemeLabel(value: AppearanceColorScheme) {
  if (value === "catppuccin") {
    return "Catppuccin";
  }

  return value[0].toUpperCase() + value.slice(1);
}

function localCategoryLabel(category: LocalFontCategory) {
  if (category === "monospace") return "mono";

  return category;
}

function withSelectedLocalFont(
  options: LocalFontOptionsResult["nonMonospace"] | LocalFontOptionsResult["monospace"],
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

export function AppearanceSettingsPage({
  theme,
  colorScheme,
  fontSize,
  interfaceFont,
  textFont,
  monospaceFont,
  sidebarPosition,
  onThemeChange,
  onColorSchemeChange,
  onFontSizeChange,
  onInterfaceFontChange,
  onTextFontChange,
  onMonospaceFontChange,
  onSidebarPositionChange,
}: Props) {
  const [localFontOptions, setLocalFontOptions] = useState<LocalFontOptionsResult>({
    available: false,
    nonMonospace: [],
    monospace: [],
  });

  useEffect(() => {
    let disposed = false;

    void getLocalFontOptions().then((result) => {
      if (disposed) return;

      setLocalFontOptions(result);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const normalizedFontScale = normalizeAppearanceFontScale(
    fontSize ?? APPEARANCE_FONT_SCALE_DEFAULT,
  );
  const selectableInterfaceLocalFonts = useMemo(
    () => withSelectedLocalFont(localFontOptions.nonMonospace, interfaceFont),
    [interfaceFont, localFontOptions.nonMonospace],
  );
  const selectableTextLocalFonts = useMemo(
    () => withSelectedLocalFont(localFontOptions.nonMonospace, textFont),
    [localFontOptions.nonMonospace, textFont],
  );
  const selectableMonospaceLocalFonts = useMemo(
    () => withSelectedLocalFont(localFontOptions.monospace, monospaceFont),
    [localFontOptions.monospace, monospaceFont],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground">
          Tune the app look and feel for your workflow.
        </p>
      </div>

      <section className="rounded-xl border bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Paintbrush className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Color and Theme</h3>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="base-color-scheme">Base color scheme</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Choose light, dark, or follow your system.
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(value) => onThemeChange(value as AppearanceTheme)}
            >
              <SelectTrigger
                id="base-color-scheme"
                className="w-full min-w-48 sm:w-52"
              >
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                {themes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="accent-color">Accent color</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Pick the active token palette for UI components.
              </p>
            </div>
            <Select
              value={colorScheme}
              onValueChange={(value) =>
                onColorSchemeChange(value as AppearanceColorScheme)
              }
            >
              <SelectTrigger
                id="accent-color"
                className="w-full min-w-48 sm:w-52"
              >
                <SelectValue placeholder="Select color scheme" />
              </SelectTrigger>
              <SelectContent>
                {COLOR_SCHEMES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {colorSchemeLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <PilcrowIcon className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Fonts</h3>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="font-size">Interface font size</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Controls global text scale used by settings-aware components.
              </p>
            </div>
            <div className="w-full min-w-48 sm:w-52">
              <Slider
                min={APPEARANCE_FONT_SCALE_MIN}
                max={APPEARANCE_FONT_SCALE_MAX}
                step={APPEARANCE_FONT_SCALE_STEP}
                value={[normalizedFontScale]}
                onValueChange={(value) =>
                  onFontSizeChange(normalizeAppearanceFontScale(value[0]))
                }
                aria-label="Interface font size"
              />
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {Math.round(normalizedFontScale * 100)}%
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="interface-font">Interface font family</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Controls labels, navigation, and app chrome text.
              </p>
            </div>
            <Select
              value={interfaceFont}
              onValueChange={(value) => {
                if (!isAppearanceInterfaceFont(value)) return;

                onInterfaceFontChange(value as AppearanceInterfaceFont);
              }}
            >
              <SelectTrigger
                id="interface-font"
                className="w-full min-w-48 sm:w-52"
              >
                <SelectValue placeholder="Select interface font" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Built-in fonts</SelectLabel>
                  {interfaceFontOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {selectableInterfaceLocalFonts.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Installed on this device</SelectLabel>
                      {selectableInterfaceLocalFonts.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label} ({localCategoryLabel(item.category)})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="text-font">Text font family</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Controls paragraph and long-form reading text.
              </p>
            </div>
            <Select
              value={textFont}
              onValueChange={(value) => {
                if (!isAppearanceTextFont(value)) return;

                onTextFontChange(value as AppearanceTextFont);
              }}
            >
              <SelectTrigger id="text-font" className="w-full min-w-48 sm:w-52">
                <SelectValue placeholder="Select text font" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Built-in fonts</SelectLabel>
                  {textFontOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {selectableTextLocalFonts.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Installed on this device</SelectLabel>
                      {selectableTextLocalFonts.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label} ({localCategoryLabel(item.category)})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="monospace-font">Monospace font family</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Controls code blocks, keycaps, and monospaced UI text.
              </p>
            </div>
            <Select
              value={monospaceFont}
              onValueChange={(value) => {
                if (!isAppearanceMonospaceFont(value)) return;

                onMonospaceFontChange(value as AppearanceMonospaceFont);
              }}
            >
              <SelectTrigger
                id="monospace-font"
                className="w-full min-w-48 sm:w-52"
              >
                <SelectValue placeholder="Select monospace font" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Built-in fonts</SelectLabel>
                  {monospaceFontOptions.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {selectableMonospaceLocalFonts.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Installed on this device</SelectLabel>
                      {selectableMonospaceLocalFonts.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label} ({localCategoryLabel(item.category)})
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card/60 p-4">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Interface</h3>
        </div>

        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="sidebar-position">Sidebar position</Label>
              <p className="text-xs text-muted-foreground pt-1">
                Place your sidebar on the left or right side of the app.
              </p>
            </div>
            <Select
              value={sidebarPosition}
              onValueChange={(value) =>
                onSidebarPositionChange(value as "left" | "right")
              }
            >
              <SelectTrigger
                id="sidebar-position"
                className="w-full min-w-48 sm:w-52"
              >
                <SelectValue placeholder="Select sidebar side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
    </div>
  );
}
