"use client";

import { useState } from "react";
import {
  Bell,
  CircleUserRound,
  LayoutGrid,
  Paintbrush,
  Shield,
  SlidersHorizontal,
} from "lucide-react";
import { DEFAULT_COLOR_SCHEME } from "@/coloe-scheme";
import type {
  AppearanceColorScheme,
  AppearanceFontSize,
  AppearanceTheme,
  UserSettings,
} from "@/data/schema";
import { useUserSettings } from "@/hooks/use-user-settings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AdvancedSettingsPage } from "@/components/settings/pages/advanced-settings-page";
import { AppearanceSettingsPage } from "@/components/settings/pages/appearance-settings-page";
import { NotificationsSettingsPage } from "@/components/settings/pages/notifications-settings-page";
import { ProfileSettingsPage } from "@/components/settings/pages/profile-settings-page";
import { WorkspaceSettingsPage } from "@/components/settings/pages/workspace-settings-page";
import { VisuallyHidden } from "radix-ui";

type SettingsSection =
  | "appearance"
  | "profile"
  | "workspace"
  | "notifications"
  | "advanced";

type SettingsSectionGroup = {
  heading: string;
  items: {
    key: SettingsSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AppearanceSettings = NonNullable<UserSettings["appearance"]>;

const SETTINGS_SECTION_GROUPS: SettingsSectionGroup[] = [
  {
    heading: "Options",
    items: [
      { key: "appearance", label: "Appearance", icon: Paintbrush },
      { key: "profile", label: "Profile", icon: CircleUserRound },
      { key: "workspace", label: "Workspace", icon: LayoutGrid },
    ],
  },
  {
    heading: "Core",
    items: [
      { key: "notifications", label: "Notifications", icon: Bell },
      { key: "advanced", label: "Advanced", icon: Shield },
    ],
  },
];

export function AppSettingsDialog({ open, onOpenChange }: Props) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("appearance");
  const { settings, updateSettings } = useUserSettings();

  const theme = settings.appearance?.theme ?? "system";
  const colorScheme = settings.appearance?.colorScheme ?? DEFAULT_COLOR_SCHEME;
  const fontSize = settings.appearance?.fontSize ?? "medium";

  function updateAppearanceSettings(patch: Partial<AppearanceSettings>) {
    void updateSettings((currentSettings) => ({
      appearance: {
        ...currentSettings.appearance,
        ...patch,
      },
    }));
  }

  function handleThemeChange(nextTheme: AppearanceTheme) {
    updateAppearanceSettings({ theme: nextTheme });
  }

  function handleColorSchemeChange(nextScheme: AppearanceColorScheme) {
    updateAppearanceSettings({ colorScheme: nextScheme });
  }

  function handleFontSizeChange(nextFontSize: AppearanceFontSize) {
    updateAppearanceSettings({ fontSize: nextFontSize });
  }

  function renderContent() {
    if (activeSection === "appearance") {
      return (
        <AppearanceSettingsPage
          theme={theme}
          colorScheme={colorScheme}
          fontSize={fontSize}
          onThemeChange={handleThemeChange}
          onColorSchemeChange={handleColorSchemeChange}
          onFontSizeChange={handleFontSizeChange}
        />
      );
    }

    if (activeSection === "profile") {
      return <ProfileSettingsPage />;
    }

    if (activeSection === "workspace") {
      return <WorkspaceSettingsPage />;
    }

    if (activeSection === "notifications") {
      return <NotificationsSettingsPage />;
    }

    return <AdvancedSettingsPage />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="block h-[80vh] min-h-0 w-[calc(100%-2rem)] sm:max-w-6xl overflow-hidden border-border/60 bg-background/98 p-0"
        showCloseButton
      >
        <VisuallyHidden.Root>
          <DialogTitle>App Settings</DialogTitle>
          <DialogDescription>
            Adjust your preferences and configure your account in the app
            settings.
          </DialogDescription>
        </VisuallyHidden.Root>

        <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="h-full min-h-0 border-b border-border/70 bg-sidebar md:border-r md:border-b-0">
            <ScrollArea className="h-full min-h-0">
              <nav className="flex flex-col gap-5 p-4 pr-6 pt-12">
                {SETTINGS_SECTION_GROUPS.map((group) => (
                  <div key={group.heading} className="space-y-px">
                    <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {group.heading}
                    </div>
                    {group.items.map((section) => {
                      const Icon = section.icon;

                      return (
                        <Button
                          key={section.key}
                          type="button"
                          variant="ghost"
                          className={cn(
                            "w-full justify-start gap-2 rounded-md px-2.5 text-sm",
                            activeSection === section.key &&
                              "bg-accent text-foreground shadow-none",
                          )}
                          onClick={() => setActiveSection(section.key)}
                        >
                          <Icon className="size-4 text-muted-foreground" />
                          {section.label}
                        </Button>
                      );
                    })}
                  </div>
                ))}
                <div className="hidden md:block" />
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-auto hidden w-full justify-start gap-2 rounded-md px-2.5 text-sm md:inline-flex"
                  onClick={() => setActiveSection("advanced")}
                >
                  <SlidersHorizontal className="size-4 text-muted-foreground" />
                  Preferences
                </Button>
              </nav>
            </ScrollArea>
          </aside>

          <ScrollArea className="h-full min-h-0 min-w-0 bg-background">
            <section className="h-full min-h-0 min-w-0 max-w-full px-5 py-5 md:px-15 md:py-6">
              {renderContent()}
            </section>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
