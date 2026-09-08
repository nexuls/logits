"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useId } from "react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  type EditorSettings,
  setEditorSetting,
  useEditorSettings,
} from "@/state/editor-settings";

type ToggleProps = {
  setting: "showGrid" | "showMinimap";
  label: string;
  description: string;
  checked: boolean;
};

function SettingSwitch({ setting, label, description, checked }: ToggleProps) {
  const id = useId();

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={(next) => setEditorSetting(setting, next)}
      />
    </div>
  );
}

/**
 * Workspace preferences. Nothing here is part of a circuit — see
 * `src/state/editor-settings.ts`.
 *
 * Rendered inside the settings dialog (`settings-dialog.tsx`), so it is plain
 * layout with no sidebar primitives.
 */
export default function EditorSettingsPanel() {
  const settings = useEditorSettings();

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          Appearance
        </h3>
        <ToggleGroup
          value={[settings.theme]}
          onValueChange={(value) => {
            // Base UI hands back the full pressed set; an empty one means the
            // active item was pressed again, which must not clear the theme.
            const next = value.at(-1) as EditorSettings["theme"] | undefined;
            if (next) setEditorSetting("theme", next);
          }}
          multiple={false}
          variant="outline"
          size="sm"
          className="w-full"
          aria-label="Theme"
        >
          <ToggleGroupItem value="dark" className="flex-1">
            <MoonIcon />
            Dark
          </ToggleGroupItem>
          <ToggleGroupItem value="light" className="flex-1">
            <SunIcon />
            Light
          </ToggleGroupItem>
        </ToggleGroup>
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Canvas</h3>
        <SettingSwitch
          setting="showGrid"
          label="Grid"
          description="Dotted grid behind the circuit."
          checked={settings.showGrid}
        />
        <SettingSwitch
          setting="showMinimap"
          label="Minimap"
          description="Overview and zoom controls."
          checked={settings.showMinimap}
        />
      </section>
    </>
  );
}
