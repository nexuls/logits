import type { LucideIcon } from "lucide-react";
import {
  FolderOpenIcon,
  MapIcon,
  MousePointerClickIcon,
  PlayIcon,
  ShapesIcon,
  Share2Icon,
} from "lucide-react";

/** Where the card sits relative to the spotlight, when there is room for it. */
export type Side = "top" | "right" | "bottom" | "left";

export type TourStep = {
  /**
   * The `data-tour` value of the element to reveal. Resolved inside the app
   * shell, so a `CircuitPreview` portalled into a dialog can never be mistaken
   * for the editor's own chrome.
   */
  target: string;
  icon: LucideIcon;
  title: string;
  body: string;
  /** Screen pixels of clearance around the target. */
  padding?: number;
  /** Cut-out corner radius, matched to the chrome underneath. */
  radius?: number;
  /** Preferred card side; the placer falls back when it does not fit. */
  side?: Side;
};

/**
 * The guided tour, in the order a first circuit gets built: find a project,
 * find a part, put it down, run it, then find your way back and share it.
 *
 * A step whose target is not on screen — a sidebar collapsed, the minimap
 * turned off in settings, the share button hidden on a narrow canvas — is
 * dropped when the tour opens rather than shown against nothing, so the
 * numbering the user sees always matches what they can actually see.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    target: "projects",
    icon: FolderOpenIcon,
    title: "Your projects live here",
    body: "Every circuit you build is saved in this browser and listed here. New project, import a .logits.json file, or open one of the worked examples from the ⋯ menu.",
    side: "right",
    padding: 0,
    radius: 2,
  },
  {
    target: "elements",
    icon: ShapesIcon,
    title: "Every part is in this palette",
    body: "Gates, inputs, displays, memory, instruments — and any chip you build yourself. Search it, or press ⌘K anywhere. The ⓘ on a row opens that part's full reference.",
    side: "left",
    padding: 0,
    radius: 2,
  },
  {
    target: "canvas",
    icon: MousePointerClickIcon,
    title: "Build on the canvas",
    body: "Click a palette entry, then click here to drop it. Click one pin and then another to wire them. Drag to move, drag empty space to select, and scroll to pan.",
    side: "top",
    padding: -12,
    radius: 12,
  },
  {
    target: "toolbar",
    icon: PlayIcon,
    title: "Run it, and see what broke",
    body: "Play and pause the simulation (Space), step one event at a time (.), and change how fast simulated time runs. The last two buttons open the performance monitor and the diagnostics panel.",
    side: "bottom",
    padding: 8,
    radius: 12,
  },
  {
    target: "minimap",
    icon: MapIcon,
    title: "Never lose the circuit",
    body: "The minimap shows every cluster on the canvas and where you are looking. The percentage in the middle resets the view — useful once a board has grown past a screenful.",
    side: "top",
    padding: 6,
    radius: 12,
  },
  {
    target: "share",
    icon: Share2Icon,
    title: "Share what you made",
    body: "Copies a link that opens your circuit as a runnable, embeddable preview — the whole circuit travels in the link, so there is nothing to sign up for.",
    side: "bottom",
    padding: 4,
    radius: 12,
  },
];
