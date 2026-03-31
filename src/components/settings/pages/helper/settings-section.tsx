import type { ReactNode } from "react";

type Props = {
  icon: ReactNode;
  title: string;
  children: ReactNode;
};

export function SettingsSection({ icon, title, children }: Props) {
  return (
    <section className="rounded-xl border bg-card/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      <div className="space-y-4">{children}</div>
    </section>
  );
}
