import { useEffect, useMemo, useState } from "react";
import { Paintbrush, PilcrowIcon, SlidersHorizontal } from "lucide-react";
import { COLOR_SCHEMES } from "@/color-schemes";
import { useUserSettings } from "@/hooks/use-user-settings";
import type {
  AppearanceColorScheme,
  AppearanceFontSize,
  AppearanceInterfaceFont,
  AppearanceMonospaceFont,
  AppearanceTextFont,
  AppearanceTheme,
} from "@/data/modules/app/settings";
import {
  APPEARANCE_FONT_SCALE_DEFAULT,
  APPEARANCE_FONT_SCALE_MAX,
  APPEARANCE_FONT_SCALE_MIN,
  APPEARANCE_FONT_SCALE_STEP,
  interfaceFontOptions,
  isAppearanceInterfaceFont,
  isAppearanceMonospaceFont,
  isAppearanceTextFont,
  monospaceFontOptions,
  normalizeAppearanceFontScale,
  textFontOptions,
} from "@/data/modules/app/settings";
import type { LocalFontOptionsResult } from "@/lib/local-fonts";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FontFamilySelect } from "./font-family-select";
import { colorSchemeLabel, themes, withSelectedLocalFont } from "./helpers";
import { SettingsSection } from "../helper/settings-section";
import { SettingsSelectRow } from "../helper/settings-select-row";

/**
 * Window event used to open the App Settings dialog from a global keyboard
 * shortcut. Dispatched by {@link AppearanceKeyboardShortcuts} and listened to
 * by the component that owns the dialog state.
 */
export const OPEN_SETTINGS_EVENT = "logits:open-settings";

/**
 * Global keyboard shortcuts owned by the appearance/settings surface.
 * Listed here so the shortcut dialog and the listener share a single source.
 */
export const APPEARANCE_KEYBOARD_SHORTCUTS = {
  openSettings: "Mod-,",
  toggleTheme: "Mod-Shift-l",
  toggleSidebarPosition: "Mod-Alt-b",
} as const;

/**
 * Mounts the global appearance/settings keyboard shortcuts:
 *  - {@link APPEARANCE_KEYBOARD_SHORTCUTS.openSettings} → dispatches
 *    {@link OPEN_SETTINGS_EVENT}.
 *  - {@link APPEARANCE_KEYBOARD_SHORTCUTS.toggleTheme} → flips between
 *    light and dark (does not change color scheme).
 *  - {@link APPEARANCE_KEYBOARD_SHORTCUTS.toggleSidebarPosition} → flips the
 *    sidebar between the left and right edges.
 *
 * Mount once at the app shell.
 */
export function AppearanceKeyboardShortcuts() {
  const { settings, updateSettings } = useUserSettings();

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod) return;

      const key = event.key.toLowerCase();

      if (!event.shiftKey && !event.altKey && event.key === ",") {
        event.preventDefault();
        window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
        return;
      }

      if (event.shiftKey && !event.altKey && key === "l") {
        event.preventDefault();
        const current = settings.appearance?.theme ?? "system";
        const next: AppearanceTheme = current === "dark" ? "light" : "dark";
        void updateSettings((currentSettings) => ({
          appearance: { ...currentSettings.appearance, theme: next },
        }));
        return;
      }

      if (event.altKey && !event.shiftKey && key === "b") {
        event.preventDefault();
        const current = settings.appearance?.sidebarPosition ?? "left";
        const next = current === "left" ? "right" : "left";
        void updateSettings((currentSettings) => ({
          appearance: { ...currentSettings.appearance, sidebarPosition: next },
        }));
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings, updateSettings]);

  return null;
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
}: {
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
}) {
  const [localFontOptions, _setLocalFontOptions] =
    useState<LocalFontOptionsResult>({
      available: false,
      nonMonospace: [],
      monospace: [],
    });

  // useEffect(() => {
  //   let disposed = false;

  //   // void getLocalFontOptions().then((result) => {
  //   //   if (disposed) return;

  //   //   setLocalFontOptions(result);
  //   // });

  //   return () => {
  //     disposed = true;
  //   };
  // }, []);

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

      <SettingsSection
        icon={<Paintbrush className="size-4 text-muted-foreground" />}
        title="Color and Theme"
      >
        <SettingsSelectRow
          id="base-color-scheme"
          label="Base color scheme"
          description="Choose light, dark, or follow your system."
          control={
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
          }
        />

        <Separator />

        <SettingsSelectRow
          id="accent-color"
          label="Accent color"
          description="Pick the active token palette for UI components."
          control={
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
          }
        />
      </SettingsSection>

      <SettingsSection
        icon={<PilcrowIcon className="size-4 text-muted-foreground" />}
        title="Fonts"
      >
        <SettingsSelectRow
          id="font-size"
          label="Interface font size"
          description="Controls global text scale used by settings-aware components."
          control={
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
          }
        />

        <Separator />

        <SettingsSelectRow
          id="interface-font"
          label="Interface font family"
          description="Controls labels, navigation, and app chrome text."
          control={
            <FontFamilySelect
              id="interface-font"
              value={interfaceFont}
              placeholder="Select interface font"
              builtInOptions={interfaceFontOptions}
              localOptions={selectableInterfaceLocalFonts}
              onValueChange={(value) => {
                if (!isAppearanceInterfaceFont(value)) return;

                onInterfaceFontChange(value as AppearanceInterfaceFont);
              }}
            />
          }
        />

        <Separator />

        <SettingsSelectRow
          id="text-font"
          label="Text font family"
          description="Controls paragraph and long-form reading text."
          control={
            <FontFamilySelect
              id="text-font"
              value={textFont}
              placeholder="Select text font"
              builtInOptions={textFontOptions}
              localOptions={selectableTextLocalFonts}
              onValueChange={(value) => {
                if (!isAppearanceTextFont(value)) return;

                onTextFontChange(value as AppearanceTextFont);
              }}
            />
          }
        />

        <Separator />

        <SettingsSelectRow
          id="monospace-font"
          label="Monospace font family"
          description="Controls code blocks, keycaps, and monospaced UI text."
          control={
            <FontFamilySelect
              id="monospace-font"
              value={monospaceFont}
              placeholder="Select monospace font"
              builtInOptions={monospaceFontOptions}
              localOptions={selectableMonospaceLocalFonts}
              onValueChange={(value) => {
                if (!isAppearanceMonospaceFont(value)) return;

                onMonospaceFontChange(value as AppearanceMonospaceFont);
              }}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        icon={<SlidersHorizontal className="size-4 text-muted-foreground" />}
        title="Interface"
      >
        <SettingsSelectRow
          id="sidebar-position"
          label="Sidebar position"
          description="Place your sidebar on the left or right side of the app."
          control={
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
          }
        />
      </SettingsSection>
    </div>
  );
}
