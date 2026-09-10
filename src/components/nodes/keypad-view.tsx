"use client";

import { intParam } from "@/lib/nodes/define";
import { keypadColumns, keypadKeys, NO_KEY } from "@/lib/nodes/io/keypad";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";

/**
 * A grid of momentary keys.
 *
 * Each key is a real `<button>`, so the pad is reachable with `Tab` and
 * pressed with `Space` without the canvas growing a keyboard path of its own.
 * Which key is down lives in the `pressed` param and the value it entered in
 * `value`, both edited through `setParams`, so a press undoes and autosaves
 * like every other document change — see the interactive-nodes section of
 * artifacts/05-node-authoring-guide.md.
 *
 * Release is bound on the key itself *and* on leaving it, the same way
 * `push-button-view` handles it: at low zoom a key is a few pixels across and
 * a pointer routinely leaves one while held, and a pad stuck asserting a key
 * is a circuit bug the user cannot explain.
 */
export default function KeypadView({
  node,
  setParams,
  interactive,
}: NodeViewProps) {
  const keys = keypadKeys(node.params);
  const columns = keypadColumns(node.params);
  const pressed = intParam(node.params, "pressed", NO_KEY);

  const press = (index: number) => {
    if (!interactive || pressed === index) return;
    // Both in one patch: the latched value and the key that is down are one
    // event, and two patches would put two entries on the undo stack.
    setParams({ pressed: index, value: keys[index].value });
  };

  const release = () => {
    if (pressed !== NO_KEY) setParams({ pressed: NO_KEY });
  };

  return (
    <div
      className="grid h-full w-full gap-0.5 p-0.5"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {keys.map((key, index) => (
        <button
          // Position, not the label: two keys may legitimately share one.
          key={`key-${index}-${key.label}`}
          type="button"
          disabled={!interactive}
          // The node body is draggable, so an interactive part has to take the
          // pointer back — otherwise the click starts a move gesture instead.
          onPointerDown={(event) => {
            event.stopPropagation();
            press(index);
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
          // Keyboard parity: space and enter fire click, which has no held
          // phase, so a key press is one full press-and-release pulse.
          onClick={() => {
            if (!interactive) return;
            setParams({ pressed: index, value: key.value });
            setParams({ pressed: NO_KEY });
          }}
          aria-pressed={pressed === index}
          aria-label={`${key.label} (${key.value})`}
          className={cn(
            "flex min-h-0 min-w-0 items-center justify-center rounded-xs border",
            "text-[8px] font-medium leading-none",
            "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            interactive ? "cursor-pointer" : "cursor-default",
            pressed === index
              ? "border-primary bg-primary/30 text-primary"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span className="truncate px-px">{key.label}</span>
        </button>
      ))}
    </div>
  );
}
