"use client";

import { Paintbrush, SlidersHorizontal } from "lucide-react";
import { COLOR_SCHEMES } from "@/coloe-scheme";
import type {
  AppearanceColorScheme,
  AppearanceFontSize,
  AppearanceTheme,
} from "@/data/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

type Props = {
  theme: AppearanceTheme;
  colorScheme: AppearanceColorScheme;
  fontSize: AppearanceFontSize;
  onThemeChange: (value: AppearanceTheme) => void;
  onColorSchemeChange: (value: AppearanceColorScheme) => void;
  onFontSizeChange: (value: AppearanceFontSize) => void;
};

const fontSizes: { value: AppearanceFontSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

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

export function AppearanceSettingsPage({
  theme,
  colorScheme,
  fontSize,
  onThemeChange,
  onColorSchemeChange,
  onFontSizeChange,
}: Props) {
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
              <p className="text-xs text-muted-foreground">
                Choose light, dark, or follow your system.
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={(value) => onThemeChange(value as AppearanceTheme)}
            >
              <SelectTrigger id="base-color-scheme" className="w-full min-w-48 sm:w-52">
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
              <p className="text-xs text-muted-foreground">
                Pick the active token palette for UI components.
              </p>
            </div>
            <Select
              value={colorScheme}
              onValueChange={(value) => onColorSchemeChange(value as AppearanceColorScheme)}
            >
              <SelectTrigger id="accent-color" className="w-full min-w-48 sm:w-52">
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

          <Separator />

          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <Label htmlFor="font-size">Interface font size</Label>
              <p className="text-xs text-muted-foreground">
                Controls global text scale used by settings-aware components.
              </p>
            </div>
            <Select
              value={fontSize}
              onValueChange={(value) => onFontSizeChange(value as AppearanceFontSize)}
            >
              <SelectTrigger id="font-size" className="w-full min-w-48 sm:w-52">
                <SelectValue placeholder="Select font size" />
              </SelectTrigger>
              <SelectContent>
                {fontSizes.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
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
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Inline title</div>
              <p className="text-xs text-muted-foreground">
                Display file names as inline editable titles.
              </p>
            </div>
            <Switch size="default" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Show tab title bar</div>
              <p className="text-xs text-muted-foreground">
                Keep the top header visible for all tabs.
              </p>
            </div>
            <Switch size="default" defaultChecked />
          </div>

          <Separator />

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Ribbon menu configuration</div>
              <p className="text-xs text-muted-foreground">
                Configure the command set shown in the ribbon menu.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline">
              Manage
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
