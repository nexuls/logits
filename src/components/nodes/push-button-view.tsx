"use client";

import { boolParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";
import { useHeldActivation } from "./use-held-activation";

/**
 * A momentary button: high while held, low the instant it is let go.
 *
 * Release is bound on the *window* rather than the button, because the pointer
 * routinely leaves the node while held — at low zoom a 40-unit button is a few
 * pixels — and a button that stayed stuck high would be a circuit bug the user
 * could not explain.
 */
export default function PushButtonView({
  node,
  setParams,
  interactive,
}: NodeViewProps) {
  const pressed = boolParam(node.params, "pressed", false);

  const press = () => {
    if (!interactive || pressed) return;
    setParams({ pressed: true });
  };

  const release = () => {
    if (pressed) setParams({ pressed: false });
  };

  const keyboard = useHeldActivation(press, release);

  return (
    <button
      type="button"
      disabled={!interactive}
      onPointerDown={(event) => {
        event.stopPropagation();
        press();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      // Space and Enter are held, not pulsed — see `use-held-activation`.
      onKeyDown={(event) => keyboard.onKeyDown(event, undefined)}
      onKeyUp={keyboard.onKeyUp}
      onBlur={keyboard.onBlur}
      onClick={() => {
        if (interactive) keyboard.pulse(undefined);
      }}
      aria-pressed={pressed}
      aria-label={`${node.label ?? "Button"}: ${pressed ? "pressed" : "released"}`}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-[3px]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span
        className={cn(
          "size-5 rounded-full border-2 transition-colors",
          pressed
            ? "border-primary bg-primary"
            : "border-muted-foreground bg-muted",
        )}
      />
    </button>
  );
}
