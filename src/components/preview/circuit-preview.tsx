"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Canvas from "@/components/canvas";
import {
  type CanvasViewport,
  IDENTITY_VIEWPORT,
} from "@/components/canvas/canvas-viewport";
import DiagnosticsPanel from "@/components/editor/diagnostics-panel";
import NodeLayer from "@/components/editor/node-layer";
import PerformanceMonitor from "@/components/editor/performance-monitor";
import SimulationControls, {
  DiagnosticsToggle,
  PerformanceToggle,
  Toolbar,
} from "@/components/editor/simulation-controls";
import {
  isEditableTarget,
  SPACE_TAP_MS,
} from "@/components/editor/use-editor-shortcuts";
import WireLayer from "@/components/editor/wire-layer";
import { Separator } from "@/components/ui/separator";
import { setLinkedNodeParams } from "@/lib/circuit/commands";
import {
  DEFAULT_SCALE,
  fitViewport,
  type Insets,
  type Viewport,
} from "@/lib/circuit/coords";
import type { CircuitDocument, Point } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import { lookupNode } from "@/lib/nodes/registry";
import { cn } from "@/lib/utils";
import { nodeAt } from "@/state/hit-test";
import { boundsOf, buildScene, sceneClusters } from "@/state/scene";
import {
  createSimulation,
  type Simulation,
  SimulationContext,
  useDiagnostics,
  useNetlist,
} from "@/state/simulation";

type Props = {
  /**
   * The circuit to show. Passing a different object starts over from it,
   * dropping whatever the viewer had changed on the last one.
   */
  document: CircuitDocument;
  className?: string;
  /** Header text. The document's name when absent. */
  title?: string;

  showHeader?: boolean;
  showGrid?: boolean;
  showMinimap?: boolean;
  /** Run / pause. The four below refine it and do nothing without it. */
  showRunControls?: boolean;
  showStepControl?: boolean;
  showResetControl?: boolean;
  showSpeedControl?: boolean;
  showTime?: boolean;
  /** The problem count in the toolbar, and the panel it opens. */
  showDiagnostics?: boolean;
  showPerformanceMonitor?: boolean;
  /** Pin names on elements whose pins are obvious from their shape. */
  showBasicPinLabels?: boolean;
  /** Pin names on elements whose pins are told apart only by name. */
  showCompoundPinLabels?: boolean;

  /** Switches, buttons, keypads and the like take input. */
  interactive?: boolean;
  /** Drag, wheel and touch pan. */
  pannable?: boolean;
  /** Ctrl/Cmd + wheel, pinch and the minimap's zoom buttons. */
  zoomable?: boolean;
  /** `Space` runs and pauses, `.` steps, while focus is inside the preview. */
  shortcuts?: boolean;

  /** Starts running as soon as the circuit is compiled. */
  autoPlay?: boolean;
  /** Simulated nanoseconds per real second to start at. */
  defaultSpeed?: number;
  /**
   * Frame the whole circuit on open, and on "reset view". Off opens at the
   * origin, as the editor does.
   */
  fitView?: boolean;
  /** Screen pixels kept clear round the circuit when it is fitted. */
  fitPadding?: number;
  /**
   * The zoom to open at when not fitting, and the most a fit may zoom in —
   * a two-gate circuit is not blown up to fill the frame. The document's own
   * `defaultZoom` when absent.
   */
  defaultZoom?: number;
  defaultDiagnosticsOpen?: boolean;
  defaultPerformanceExpanded?: boolean;

  /** Repaint key for the minimap, which samples theme colours imperatively. */
  themeKey?: string;
  /**
   * Called with the circuit after the viewer operates it — a switch flipped, a
   * key pressed. The preview never writes it anywhere itself.
   */
  onDocumentChange?: (document: CircuitDocument) => void;
};

/**
 * A circuit on a canvas that can be run and operated but not edited: the
 * editor with its editing taken out, for embedding — docs, a landing page, a
 * shared link.
 *
 * It runs a simulation of its own, provided to everything under it through
 * `SimulationContext`, so it never touches the editor's open document or
 * engine and any number of previews can share a page. The circuit is held
 * here as a copy: operating a node view goes through the same pure command the
 * document store uses (`setLinkedNodeParams`), with no history and nothing
 * saved, because nothing here is an edit the user could want to keep.
 */
export default function CircuitPreview({ defaultSpeed, ...props }: Props) {
  const [simulation] = useState(() =>
    createSimulation({ runner: { speedNsPerSecond: defaultSpeed } }),
  );

  useEffect(() => () => simulation.dispose(), [simulation]);

  return (
    <SimulationContext value={simulation}>
      <PreviewSurface simulation={simulation} {...props} />
    </SimulationContext>
  );
}

/** Stable empties, so the memoised layers do not re-render on every frame. */
const NO_IDS: readonly string[] = [];
const NO_KEYS: ReadonlySet<string> = new Set();
const ignore = () => {};

const ORIGIN: Point = { x: 0, y: 0 };

/** Clearance for the header and toolbar along the top, the minimap and monitor along the bottom. */
const TOP_CHROME_PX = 48;
const BOTTOM_CHROME_PX = 40;

function PreviewSurface({
  simulation,
  document: source,
  className,
  title,
  showHeader = true,
  showGrid = true,
  showMinimap = true,
  showRunControls = true,
  showStepControl = true,
  showResetControl = true,
  showSpeedControl = true,
  showTime = true,
  showDiagnostics = true,
  showPerformanceMonitor = true,
  showBasicPinLabels = false,
  showCompoundPinLabels = true,
  interactive = true,
  pannable = true,
  zoomable = true,
  shortcuts = true,
  autoPlay = false,
  fitView = true,
  fitPadding = 24,
  defaultZoom,
  defaultDiagnosticsOpen = false,
  defaultPerformanceExpanded = false,
  themeKey,
  onDocumentChange,
}: Omit<Props, "defaultSpeed"> & { simulation: Simulation }) {
  // The copy the viewer operates, started over whenever the caller passes a
  // different circuit — adjusted during render, so the stale one never draws.
  const [circuit, setCircuit] = useState(source);
  const [shownSource, setShownSource] = useState(source);
  if (source !== shownSource) {
    setShownSource(source);
    setCircuit(source);
  }

  useEffect(() => {
    simulation.syncDocument(circuit);
  }, [simulation, circuit]);

  // After the sync above, which is what gives the simulation a runner to play.
  useEffect(() => {
    if (autoPlay) simulation.play();
  }, [simulation, autoPlay]);

  const onDocumentChangeRef = useRef(onDocumentChange);
  onDocumentChangeRef.current = onDocumentChange;
  useEffect(() => {
    if (circuit !== shownSource) onDocumentChangeRef.current?.(circuit);
  }, [circuit, shownSource]);

  const setNodeParams = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      setCircuit((current) =>
        setLinkedNodeParams(current, lookupNode, nodeId, patch),
      );
    },
    [],
  );

  const netlist = useNetlist();
  const diagnostics = useDiagnostics();

  const documentLookup = useMemo(
    () => subcircuitLookup(circuit, lookupNode),
    [circuit],
  );
  const scene = useMemo(
    () => buildScene(circuit, documentLookup, netlist?.pinToNet),
    [circuit, documentLookup, netlist],
  );
  const contentGroups = useMemo(() => sceneClusters(scene), [scene]);

  const faulted = useMemo(() => {
    const nodes = new Set<string>();
    const wires = new Set<string>();
    for (const diagnostic of diagnostics) {
      for (const id of diagnostic.nodeIds ?? []) nodes.add(id);
      for (const id of diagnostic.wireIds ?? []) wires.add(id);
    }
    return { nodes, wires };
  }, [diagnostics]);

  const [diagnosticsOpen, setDiagnosticsOpen] = useState(
    defaultDiagnosticsOpen,
  );
  const [performanceOpen, setPerformanceOpen] = useState(
    defaultPerformanceExpanded,
  );

  const showToolbar =
    showRunControls || showDiagnostics || showPerformanceMonitor;

  // How the circuit is framed: worked out once per circuit, against the size
  // the preview actually got, and then left alone — a resize must not yank the
  // view away from where the viewer panned it.
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomCap = defaultZoom ?? circuit.defaultZoom ?? DEFAULT_SCALE;
  const framingKey = `${circuit.id}:${fitView ? "fit" : "origin"}:${zoomCap}`;
  const [framing, setFraming] = useState<{
    key: string;
    view: Viewport;
  } | null>(null);

  const topInset = fitPadding + (showHeader || showToolbar ? TOP_CHROME_PX : 0);
  const bottomInset =
    fitPadding + (showMinimap || showPerformanceMonitor ? BOTTOM_CHROME_PX : 0);

  useEffect(() => {
    if (framing?.key === framingKey) return;

    const container = containerRef.current;
    if (!container) return;

    const bounds = fitView ? boundsOf(contentGroups) : null;
    if (!bounds) {
      setFraming({ key: framingKey, view: { scale: zoomCap, offset: ORIGIN } });
      return;
    }

    const frame = () => {
      const size = {
        width: container.clientWidth,
        height: container.clientHeight,
      };
      // A preview mounted hidden — a closed tab, a collapsed section — has no
      // size to fit into yet, and fitting into zero is the minimum zoom.
      if (size.width === 0 || size.height === 0) return false;

      const padding: Insets = {
        top: topInset,
        right: fitPadding,
        bottom: bottomInset,
        left: fitPadding,
      };
      setFraming({
        key: framingKey,
        view: fitViewport(bounds, size, { padding, maxScale: zoomCap }),
      });
      return true;
    };

    if (frame()) return;

    const observer = new ResizeObserver(() => {
      if (frame()) observer.disconnect();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [
    framing?.key,
    framingKey,
    fitView,
    contentGroups,
    zoomCap,
    fitPadding,
    topInset,
    bottomInset,
  ]);

  const [viewport, setViewport] = useState<CanvasViewport>(IDENTITY_VIEWPORT);

  // Floating pin names appear on the node under the cursor. Picked against the
  // scene, as the editor does, because node bodies take no pointer events.
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const spaceTap = useRef({ at: 0, pointerUsed: false });

  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    spaceTap.current.pointerUsed = true;
    // The canvas cancels the press that would have moved focus here, and the
    // keys below only reach the preview while focus is inside it.
    const root = event.currentTarget;
    if (!root.contains(globalThis.document.activeElement)) {
      root.focus({ preventScroll: true });
    }
  };

  // Scoped to the preview rather than bound on `window`, so a page with
  // several previews — or the editor — runs only the one being used.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!shortcuts || isEditableTarget(event.target)) return;

    if (event.code === "Space") {
      // Space on a focused control is that control's click.
      if (isControl(event.target)) return;
      event.preventDefault();
      if (!event.repeat) {
        spaceTap.current = { at: event.timeStamp, pointerUsed: false };
      }
      return;
    }

    if (event.key === ".") {
      event.preventDefault();
      simulation.step();
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      !shortcuts ||
      event.code !== "Space" ||
      isEditableTarget(event.target) ||
      isControl(event.target)
    ) {
      return;
    }

    // A short press with no pointer down in between: a long one, or one held
    // through a drag, was the space-drag pan.
    const { at, pointerUsed } = spaceTap.current;
    if (at > 0 && !pointerUsed && event.timeStamp - at < SPACE_TAP_MS) {
      simulation.togglePlay();
    }
    spaceTap.current = { at: 0, pointerUsed: false };
  };

  const name = title ?? circuit.name;

  return (
    <section
      ref={containerRef}
      data-circuit-preview=""
      aria-label={`Circuit preview: ${name}`}
      tabIndex={-1}
      onPointerDownCapture={onPointerDownCapture}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      className={cn(
        "relative h-full w-full overflow-hidden bg-background outline-none",
        className,
      )}
    >
      {framing && (
        <Canvas
          title={name}
          showHeader={showHeader}
          showSidebarToggle={false}
          showGrid={showGrid}
          showMinimap={showMinimap}
          defaultZoom={framing.view.scale}
          defaultOffset={framing.view.offset}
          viewKey={framing.key}
          contentGroups={contentGroups}
          themeKey={themeKey}
          pannable={pannable}
          zoomable={zoomable}
          dragToPan
          onViewportChange={setViewport}
          onContentPointerMove={(event) => {
            const overNodeId =
              nodeAt(
                scene,
                viewport.toWorld({ x: event.clientX, y: event.clientY }),
              )?.node.id ?? null;
            setHoveredNodeId((shown) =>
              shown === overNodeId ? shown : overNodeId,
            );
          }}
          onContentPointerLeave={() => setHoveredNodeId(null)}
          overlay={
            <>
              {showToolbar && (
                <Toolbar>
                  {showRunControls && (
                    <SimulationControls
                      showStep={showStepControl}
                      showReset={showResetControl}
                      showSpeed={showSpeedControl}
                      showTime={showTime}
                      showShortcuts={shortcuts}
                    />
                  )}
                  {showRunControls &&
                    (showDiagnostics || showPerformanceMonitor) && (
                      <Separator orientation="vertical" className="mx-1 h-6" />
                    )}
                  {showPerformanceMonitor && (
                    <PerformanceToggle
                      pressed={performanceOpen}
                      onToggle={() => setPerformanceOpen((open) => !open)}
                    />
                  )}
                  {showDiagnostics && (
                    <DiagnosticsToggle
                      pressed={diagnosticsOpen}
                      onToggle={() => setDiagnosticsOpen((open) => !open)}
                    />
                  )}
                </Toolbar>
              )}

              {/* The editor's corner column: diagnostics stacked above the
                  monitor, passing presses through where it is empty. */}
              <div className="pointer-events-none absolute top-14 right-0 bottom-0 z-20 flex flex-col items-end justify-end gap-2">
                {showDiagnostics && diagnosticsOpen && (
                  <DiagnosticsPanel onClose={() => setDiagnosticsOpen(false)} />
                )}
                {showPerformanceMonitor && (
                  <PerformanceMonitor
                    expanded={performanceOpen}
                    onToggle={() => setPerformanceOpen((open) => !open)}
                  />
                )}
              </div>
            </>
          }
        >
          <NodeLayer
            layer="enclosures"
            scene={scene}
            selectedNodeIds={NO_IDS}
            faultedNodeIds={faulted.nodes}
            interactive={interactive}
            showBasicPinLabels={showBasicPinLabels}
            showCompoundPinLabels={showCompoundPinLabels}
            hoveredNodeId={hoveredNodeId}
            editingNodeId={null}
            compatiblePinIds={NO_KEYS}
            wiring={false}
            onSelectNode={ignore}
            onPinActivate={ignore}
            onSetNodeParams={setNodeParams}
          />
          <WireLayer
            scene={scene}
            selectedWireIds={NO_IDS}
            faultedWireIds={faulted.wires}
            pending={null}
            waypointGhost={null}
            band={null}
          />
          <NodeLayer
            layer="circuit"
            scene={scene}
            selectedNodeIds={NO_IDS}
            faultedNodeIds={faulted.nodes}
            interactive={interactive}
            showBasicPinLabels={showBasicPinLabels}
            showCompoundPinLabels={showCompoundPinLabels}
            hoveredNodeId={hoveredNodeId}
            editingNodeId={null}
            compatiblePinIds={NO_KEYS}
            wiring={false}
            onSelectNode={ignore}
            onPinActivate={ignore}
            onSetNodeParams={setNodeParams}
          />
        </Canvas>
      )}
    </section>
  );
}

/** A focused button or link, whose own Space the preview must leave alone. */
function isControl(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, a[href], [role="button"]') !== null
  );
}
