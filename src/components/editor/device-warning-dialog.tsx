"use client";

import { MonitorSmartphoneIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { setEditorSetting, useEditorSettings } from "@/state/editor-settings";

/** Narrow enough that the canvas has lost chrome — matches `useIsMobile`. */
const NARROW = "(max-width: 767px)";

/**
 * Touch as the *only* pointer. `hover: none` is what rules out a laptop with a
 * touchscreen, which still has the trackpad every editing gesture is written
 * against; `pointer: coarse` alone would warn there for nothing.
 */
const TOUCH_ONLY = "(pointer: coarse) and (hover: none)";

/**
 * Warns, once per device, that the editor is built for a mouse, a keyboard and
 * a screen with room for the chrome.
 *
 * Touch and small screens are out of scope
 * (artifacts/01-product-spec.md) and only the *layout* is defended, so a
 * phone opens a canvas it can pan and run but not edit. Saying so on arrival
 * is cheaper than letting someone work that out by dragging a gate and
 * watching the canvas pan instead.
 *
 * Self-contained on purpose: the editor renders it unconditionally and knows
 * nothing about the queries or the acknowledgement.
 */
export default function DeviceWarningDialog() {
  const { deviceWarningDismissed } = useEditorSettings();
  const narrow = useMediaQuery(NARROW);
  const touchOnly = useMediaQuery(TOUCH_ONLY);

  const open = !deviceWarningDismissed && (narrow || touchOnly);

  return (
    <Dialog
      open={open}
      // Only ever closed, and a close is the acknowledgement however it came
      // — the button, Esc, or a press outside.
      onOpenChange={() => setEditorSetting("deviceWarningDismissed", true)}
    >
      <DialogContent showCloseButton={false} className="gap-4">
        <DialogHeader>
          <div
            aria-hidden
            className="mb-2 inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <MonitorSmartphoneIcon className="size-5" />
          </div>
          <DialogTitle>Built for a bigger screen</DialogTitle>
          <DialogDescription>
            {touchOnly
              ? "Logits is designed for a mouse and a keyboard."
              : "This window is narrower than Logits is designed for."}{" "}
            You can browse, pan, zoom and run a circuit here, and tap switches
            and buttons in it.
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          <li>
            Placing, wiring, moving and selecting need a mouse — a drag pans the
            canvas instead.
          </li>
          <li>Keyboard shortcuts need a keyboard.</li>
          <li>Some of the chrome is hidden to fit the canvas in.</li>
        </ul>

        <DialogFooter>
          <Button
            onClick={() => setEditorSetting("deviceWarningDismissed", true)}
          >
            Continue anyway
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">
          Shown once per device. Open Logits on a desktop for the full editor.
        </p>
      </DialogContent>
    </Dialog>
  );
}
