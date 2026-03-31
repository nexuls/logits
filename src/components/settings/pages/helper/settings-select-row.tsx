import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

type Props = {
  id: string;
  label: string;
  description: string;
  control: ReactNode;
};

export function SettingsSelectRow({ id, label, description, control }: Props) {
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="pt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  );
}
