"use client";

import {
  BookOpenIcon,
  BoxesIcon,
  GaugeIcon,
  KeyboardIcon,
  LayersIcon,
  type LucideIcon,
  MousePointerClickIcon,
  PencilRulerIcon,
  Share2Icon,
  SparklesIcon,
  WaypointsIcon,
  ZapIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import CircuitPreview from "@/components/preview/circuit-preview";
import ExampleThumbnail from "@/components/projects/example-thumbnail";
import { Kbd } from "@/components/ui/kbd";
import { getExample } from "@/example";
import type { CircuitDocument } from "@/lib/circuit/schema";
import { cn } from "@/lib/utils";
import WorkspaceMap, { WORKSPACE_REGIONS } from "./workspace-map";

/**
 * The welcome's pages.
 *
 * The demonstrations are live `CircuitPreview`s of circuits the app already
 * ships rather than recorded video: they are smaller than a clip, they are
 * correct in both themes and at any size, they cannot go stale when the
 * rendering changes, and the reader can flip a switch instead of watching
 * someone else do it. A preview runs a simulation of its own, so one is
 * mounted only while its page is the one on screen.
 */

type PageProps = {
  /** This page is the one on screen. Only then does a demo run. */
  active: boolean;
  /** Repaint key for anything that samples theme colours imperatively. */
  themeKey: string;
};

export type WelcomePage = {
  id: string;
  /** Announced as the dialog's title while the page is on screen. */
  title: string;
  description: string;
  Content: (props: PageProps) => ReactNode;
};

/**
 * A shipped example, by the id in its save file — the same id its
 * `/preview/example/<id>` link uses, so these are already public names.
 * `undefined` if one is ever removed, which costs the page its demo and
 * nothing else.
 */
const demo = (id: string): CircuitDocument | undefined =>
  getExample(id)?.document;

const GATE_SAMPLER = demo("ex_gate_sampler");
const HALF_ADDER = demo("d__dHcIYtcA811");
const SR_LATCH = demo("d_oAusJaF1x0yN");

/** Two panes on a wide dialog, stacked on a narrow one. */
function Split({ media, children }: { media: ReactNode; children: ReactNode }) {
  return (
    <div className="grid h-full min-h-0 gap-5 overflow-y-auto p-6 sm:grid-cols-[1.1fr_1fr] sm:gap-7 sm:overflow-hidden sm:p-8">
      <div className="min-h-44 sm:min-h-0">{media}</div>
      {/* Two elements, because centring and scrolling do not compose: a flex
          box that centres overflowing content pushes the top of it above its
          own scroll origin, where it can never be reached. The outer box
          scrolls, and `min-h-full` on the inner one is what still centres
          content short enough to fit. */}
      <div className="min-h-0 sm:overflow-y-auto">
        <div className="flex min-h-full flex-col justify-center gap-4">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The live demo, framed.
 *
 * The inactive state is the same circuit as a still — `ExampleThumbnail`, the
 * drawing the examples gallery uses — so sliding between pages shows a circuit
 * throughout instead of an empty box that fills in when the slide lands.
 */
function Demo({
  document,
  active,
  themeKey,
  caption,
  controls = false,
}: {
  document: CircuitDocument | undefined;
  active: boolean;
  themeKey: string;
  caption: string;
  /** Show the run controls. Off where they would only cover the circuit. */
  controls?: boolean;
}) {
  if (!document) return null;

  return (
    <figure className="flex h-full min-h-0 flex-col gap-2">
      <div className="relative min-h-40 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        {active ? (
          <CircuitPreview
            document={document}
            themeKey={themeKey}
            showHeader={false}
            showMinimap={false}
            showRunControls={controls}
            showStepControl={false}
            showSpeedControl={false}
            showTime={false}
            showDiagnostics={false}
            showPerformanceMonitor={false}
            shortcuts={false}
            fitPadding={28}
            autoPlay
          />
        ) : (
          <ExampleThumbnail document={document} className="p-6 opacity-50" />
        )}
      </div>
      <figcaption className="text-center text-[11px] text-muted-foreground">
        {caption}
      </figcaption>
    </figure>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
  );
}

function Points({
  items,
}: {
  items: readonly { icon: LucideIcon; title: string; body: string }[];
}) {
  return (
    <ul className="grid gap-3">
      {items.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <Icon className="size-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {body}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- page 1 */

function Hello({ active, themeKey }: PageProps) {
  return (
    <Split
      media={
        <Demo
          document={GATE_SAMPLER}
          active={active}
          themeKey={themeKey}
          caption="Live, not a video — click the switches."
        />
      }
    >
      <div>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
          <SparklesIcon className="size-3" />
          Welcome to Logits
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-balance">
          Design digital logic, and watch it run.
        </h2>
      </div>

      <Lead>
        Place gates, wire their pins, and the simulation follows every edge as
        you build. Nothing to install, and your circuits are saved in this
        browser.
      </Lead>

      <Points
        items={[
          {
            icon: ZapIcon,
            title: "Event-driven simulation",
            body: "Real propagation delays, so a race condition behaves like one.",
          },
          {
            icon: WaypointsIcon,
            title: "Gates up to whole machines",
            body: "Adders, counters, memory, displays — and chips you build yourself.",
          },
          {
            icon: GaugeIcon,
            title: "Instruments on the board",
            body: "Oscilloscope, readouts and a diagnostics panel that names the fault.",
          },
        ]}
      />
    </Split>
  );
}

/* ---------------------------------------------------------------- page 2 */

function Workspace({ active }: PageProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  // Cycles nothing on its own: the map highlights whatever the reader is
  // pointing at, and sits neutral otherwise.
  const shown = active ? hovered : null;

  return (
    <Split
      media={
        <figure className="flex h-full min-h-0 flex-col gap-2">
          <div className="min-h-40 flex-1 overflow-hidden rounded-xl border border-border bg-card p-3">
            <WorkspaceMap active={shown} />
          </div>
          <figcaption className="text-center text-[11px] text-muted-foreground">
            Point at a row to find it on the map.
          </figcaption>
        </figure>
      }
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Six places, and that is the whole app
        </h2>
        <Lead>
          Both side panels fold away with <Kbd>⌘B</Kbd> and <Kbd>⌘J</Kbd> when
          you want the canvas to yourself.
        </Lead>
      </div>

      <ul className="grid gap-1">
        {WORKSPACE_REGIONS.map((region, at) => (
          <li key={region.id}>
            <button
              type="button"
              onMouseEnter={() => setHovered(at)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(at)}
              onBlur={() => setHovered(null)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                shown === at ? "bg-primary/10" : "hover:bg-muted",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold transition-colors",
                  shown === at
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {at + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {region.title}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {region.blurb}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Split>
  );
}

/* ---------------------------------------------------------------- page 3 */

const BUILD_STEPS = [
  {
    title: "Pick a part",
    body: "Click it in the Elements palette on the right, or press ⌘K and search. Right-click the row to arm several at once.",
  },
  {
    title: "Drop it on the canvas",
    body: "Click where you want it. It snaps to the grid; hold Alt while dragging to ignore the grid.",
  },
  {
    title: "Wire pin to pin",
    body: "Click one pin, then the next. Click empty space on the way to bend the wire, or land on another wire to tap it.",
  },
  {
    title: "Operate it",
    body: "Switches, buttons and keypads take clicks while the simulation runs. The wire brightens when it carries a 1.",
  },
] as const;

function Build({ active, themeKey }: PageProps) {
  return (
    <Split
      media={
        <Demo
          document={HALF_ADDER}
          active={active}
          themeKey={themeKey}
          caption="A half adder: two bits in, sum and carry out."
        />
      }
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Building is four clicks
        </h2>
        <Lead>
          No mode to switch into and no tool to select — placing and wiring are
          the same click.
        </Lead>
      </div>

      <ol className="grid gap-2.5">
        {BUILD_STEPS.map((step, at) => (
          <li key={step.title} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
            >
              {at + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <MousePointerClickIcon
          aria-hidden
          className="mr-1.5 inline size-3.5 align-[-2px]"
        />
        Got it wrong? <Kbd>⌘Z</Kbd> undoes the whole gesture, not one pointer
        move of it.
      </p>
    </Split>
  );
}

/* ---------------------------------------------------------------- page 4 */

/**
 * The four signal values, drawn the way the canvas draws them (ADR 0002). `X`
 * carries a marker and not only a colour, which is the same rule the wire
 * layer follows — colour alone is not a signal.
 */
const SIGNALS = [
  {
    value: "1",
    name: "High",
    body: "Drawn bright.",
    line: "bg-primary",
    dashed: false,
  },
  {
    value: "0",
    name: "Low",
    body: "Drawn dim.",
    line: "bg-muted-foreground/60",
    dashed: false,
  },
  {
    value: "X",
    name: "Unknown or conflicting",
    body: "Two drivers disagree, or nothing has settled yet.",
    line: "bg-destructive",
    dashed: false,
  },
  {
    value: "Z",
    name: "High impedance",
    body: "Nothing is driving the net. Drawn as a broken line.",
    line: "bg-muted-foreground/60",
    dashed: true,
  },
] as const;

function Run({ active, themeKey }: PageProps) {
  return (
    <Split
      media={
        <Demo
          document={SR_LATCH}
          active={active}
          themeKey={themeKey}
          caption="An SR latch: set it, reset it, and it remembers."
          controls
        />
      }
    >
      <div>
        <h2 className="text-xl font-semibold tracking-tight">
          Run it, and read what it says
        </h2>
        <Lead>
          <Kbd>Space</Kbd> runs and pauses, <Kbd>.</Kbd> steps a single event,
          and the speed control slows simulated time down until you can watch a
          glitch happen.
        </Lead>
      </div>

      <dl className="grid gap-1.5">
        {SIGNALS.map((signal) => (
          <div
            key={signal.value}
            className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-1.5"
          >
            <span aria-hidden className="flex w-12 shrink-0 items-center gap-1">
              <span
                className={cn(
                  "h-1 flex-1 rounded-full",
                  signal.dashed
                    ? "bg-[repeating-linear-gradient(90deg,var(--muted-foreground)_0_4px,transparent_4px_8px)] opacity-60"
                    : signal.line,
                )}
              />
              <span
                className={cn(
                  "font-mono text-xs font-bold",
                  signal.value === "X"
                    ? "text-destructive"
                    : signal.value === "1"
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                {signal.value}
              </span>
            </span>
            <div className="min-w-0">
              <dt className="text-sm font-medium">{signal.name}</dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">
                {signal.body}
              </dd>
            </div>
          </div>
        ))}
      </dl>

      <p className="text-xs leading-relaxed text-muted-foreground">
        The diagnostics panel in the toolbar names whatever caused an{" "}
        <span className="font-mono font-bold">X</span>.
      </p>
    </Split>
  );
}

/* ---------------------------------------------------------------- page 5 */

const FEATURES = [
  {
    icon: BoxesIcon,
    title: "Make your own chips",
    body: "Select a working block and press ⌘G. It becomes a part in your palette, reusable like any gate.",
  },
  {
    icon: BookOpenIcon,
    title: "Twelve worked examples",
    body: "From an SR latch to a four-function calculator and a digit recogniser. In the projects ⋯ menu.",
  },
  {
    icon: PencilRulerIcon,
    title: "Annotate the board",
    body: "Titled, tinted groups and Markdown notes, so a circuit explains itself later.",
  },
  {
    icon: LayersIcon,
    title: "Instruments",
    body: "An oscilloscope, seven-segment readouts, a dot matrix, keypads and a drawpad.",
  },
  {
    icon: Share2Icon,
    title: "Share or export",
    body: "A link carries the whole circuit as a runnable preview, or export plain .logits.json.",
  },
  {
    icon: KeyboardIcon,
    title: "It is all on the keyboard",
    body: "Press ? at any time for the full list of shortcuts.",
  },
] as const;

function Further() {
  return (
    <div className="h-full min-h-0 overflow-y-auto p-6 sm:p-8">
      <h2 className="text-xl font-semibold tracking-tight">
        When you are ready for more
      </h2>
      <Lead>
        None of this is in your way on day one — it is here when the circuit
        outgrows one screen.
      </Lead>

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-xl border border-border/60 bg-card/50 p-3"
          >
            <span
              aria-hidden
              className="inline-flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
            >
              <Icon className="size-3.5" />
            </span>
            <p className="mt-2 text-sm font-medium">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const WELCOME_PAGES: readonly WelcomePage[] = [
  {
    id: "hello",
    title: "Welcome to Logits",
    description:
      "An interactive canvas for designing and simulating digital logic.",
    Content: Hello,
  },
  {
    id: "workspace",
    title: "Your workspace",
    description: "Where everything lives: projects, canvas, toolbar, palette.",
    Content: Workspace,
  },
  {
    id: "build",
    title: "Building a circuit",
    description: "Place a part, wire pin to pin, then operate it.",
    Content: Build,
  },
  {
    id: "run",
    title: "Running and reading a circuit",
    description: "Run controls, the four signal values, and diagnostics.",
    Content: Run,
  },
  {
    id: "further",
    title: "Going further",
    description: "Subcircuits, examples, annotations, instruments and sharing.",
    Content: Further,
  },
];
