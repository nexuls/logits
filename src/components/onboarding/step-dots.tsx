"use client";

import { cn } from "@/lib/utils";

type Props = {
  count: number;
  index: number;
  /** Singular noun for the labels — "page", "tour step". */
  label: string;
  onSelect: (index: number) => void;
  className?: string;
};

/**
 * The page indicator under a sequence, shared by the welcome dialog and the
 * tour so the two read as one flow.
 *
 * Buttons rather than decoration: the dots are the only way back to a page
 * several steps behind, and a dot that can be clicked has to be reachable from
 * the keyboard too. The active one stretches instead of only changing colour,
 * so position is legible without relying on the contrast between two greys.
 */
export default function StepDots({
  count,
  index,
  label,
  onSelect,
  className,
}: Props) {
  // The positions as values rather than a map over indices: a dot has no
  // identity beyond where it sits, and `at` being the item is what makes it a
  // legitimate key.
  const positions = Array.from({ length: count }, (_, at) => at);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {positions.map((at) => (
        <button
          key={at}
          type="button"
          onClick={() => onSelect(at)}
          aria-label={`Go to ${label} ${at + 1} of ${count}`}
          aria-current={at === index ? "step" : undefined}
          className={cn(
            "h-1.5 rounded-full transition-all duration-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover focus-visible:outline-none",
            at === index
              ? "w-6 bg-primary"
              : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/60",
          )}
        />
      ))}
    </div>
  );
}
