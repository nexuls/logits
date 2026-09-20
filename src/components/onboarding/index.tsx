"use client";

import { type RefObject, useEffect, useState } from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { setEditorSetting, useEditorSettings } from "@/state/editor-settings";
import GuidedTour from "./guided-tour";
import WelcomeDialog from "./welcome-dialog";

type Props = {
  /**
   * The app shell, inside which the tour looks up the chrome it reveals.
   * Scoping the lookup here is what keeps a `CircuitPreview` — which renders
   * the same canvas, toolbar and minimap into a portal — out of the search.
   */
  rootRef: RefObject<HTMLElement | null>;
  themeKey: string;
  /**
   * Bumped to replay the welcome from the project menu, whatever has been
   * seen before. A counter rather than a boolean so a second request while the
   * dialog is already closing still reopens it.
   */
  replayToken: number;
};

/**
 * The device the editor is written for. Only there does the welcome open by
 * itself: a first-run tour of mouse gestures is no use on a phone, and this is
 * the complement of `device-warning-dialog.tsx`'s own queries, so the two
 * cannot both claim the screen on arrival. Replaying from the menu ignores it.
 */
const FULL_EDITOR = "(min-width: 768px) and (hover: hover)";

/** `handoff` is the beat between the two, so they never overlap on screen. */
type Stage = "welcome" | "handoff" | "tour" | null;

/**
 * First-run onboarding: the welcome dialog, and the guided tour it hands over
 * to.
 *
 * Which of the two has been seen is remembered separately
 * (`editor-settings.ts`), because they end independently — dismissing the
 * welcome early must not also burn the tour, and the tour has to be replayable
 * on its own from the menu.
 */
export default function Onboarding({ rootRef, themeKey, replayToken }: Props) {
  const { welcomeSeen } = useEditorSettings();
  const fullEditor = useMediaQuery(FULL_EDITOR);
  const [stage, setStage] = useState<Stage>(null);

  // Nothing opens during the first client render. `welcomeSeen` is false in
  // the server snapshot, so opening straight away would flash the welcome at
  // every returning user for the frame before `localStorage` is read.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    if (!hydrated || welcomeSeen || !fullEditor) return;
    setStage("welcome");
  }, [hydrated, welcomeSeen, fullEditor]);

  // A replay always starts from the welcome. The token is the whole
  // dependency, so a settings change never re-triggers it.
  useEffect(() => {
    if (replayToken > 0) setStage("welcome");
  }, [replayToken]);

  // The welcome's backdrop and the tour's dimming are both full-screen, and
  // handing straight over would stack them for the length of the dialog's
  // close animation. This waits that out instead.
  useEffect(() => {
    if (stage !== "handoff") return;
    const handle = setTimeout(() => setStage("tour"), 200);
    return () => clearTimeout(handle);
  }, [stage]);

  return (
    <>
      <WelcomeDialog
        open={stage === "welcome"}
        themeKey={themeKey}
        onClose={({ tour }) => {
          setEditorSetting("welcomeSeen", true);
          // Offered rather than assumed: the tour follows only from the last
          // page's own button, so Skip and Esc end the whole thing.
          setStage(tour ? "handoff" : null);
        }}
      />

      <GuidedTour
        open={stage === "tour"}
        rootRef={rootRef}
        onClose={() => {
          setEditorSetting("tourSeen", true);
          setStage(null);
        }}
      />
    </>
  );
}
