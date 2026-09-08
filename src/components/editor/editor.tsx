"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Canvas from "@/components/canvas";
import {
  type CanvasViewport,
  IDENTITY_VIEWPORT,
} from "@/components/canvas/canvas-viewport";
import type { Rect } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  closeDocument,
  openDocument,
  placeNode,
  renameOpenDocument,
  useDocument,
  useIsEphemeral,
} from "@/state/document";
import { buildScene, type Scene } from "@/state/scene";
import { pruneSelection, selectOnly, useSelection } from "@/state/selection";
import { getNetlist, syncDocument, useDiagnostics } from "@/state/simulation";
import CommandMenu from "./command-menu";
import DiagnosticsPanel from "./diagnostics-panel";
import GhostLayer from "./ghost-layer";
import Inspector, { InspectorAnchor, selectionBounds } from "./inspector";
import NodeLayer from "./node-layer";
import RunControls from "./run-controls";
import SettingsDialog from "./settings-dialog";
import { useEditorGestures } from "./use-editor-gestures";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import WireLayer from "./wire-layer";

type Props = {
  projectId: string;
  showGrid: boolean;
  showMinimap: boolean;
  themeKey: string;
  /** Node type armed by the palette, or null. */
  armedType: string | null;
  /** How many copies the next canvas click drops. */
  armedCount: number;
  onDisarm: () => void;
};

/**
 * The editor surface: the canvas, the layers on it, and the gestures over it.
 *
 * It is the one place that wires the stores together — document in, scene and
 * netlist derived, simulation synced — and it holds no circuit state of its
 * own. Everything below it is either a pure render of the scene or a command
 * call, which is what keeps undo and autosave to one hook each.
 */
export default function Editor({
  projectId,
  showGrid,
  showMinimap,
  themeKey,
  armedType,
  armedCount,
  onDisarm,
}: Props) {
  const document = useDocument();
  const ephemeral = useIsEphemeral();
  const selection = useSelection();
  const diagnostics = useDiagnostics();

  const [notice, setNotice] = useState<string | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!projectId) {
      closeDocument();
      return;
    }
    if (!openDocument(projectId)) closeDocument();
  }, [projectId]);

  // The compiled netlist follows the document, and the scene follows the
  // netlist. Doing it in an effect means the very first render of an edit
  // draws with the previous net ids — one frame of stale wire colour, against
  // compiling the netlist twice per edit if the scene did it itself.
  useEffect(() => {
    syncDocument(document);
  }, [document]);

  useEffect(() => {
    if (!document) return;
    pruneSelection(
      (id) => id in document.nodes,
      (id) => id in document.wires,
    );
  }, [document]);

  const netlist = getNetlist();
  const scene = useMemo(
    () =>
      document
        ? buildScene(document, lookupNode, netlist?.pinToNet)
        : { nodes: {}, wires: {} },
    [document, netlist],
  );

  const notify = useCallback((message: string) => {
    setNotice(message);
  }, []);

  // One timer for the whole editor, restarted by each notice, so a burst of
  // messages does not leave several racing to clear the same slot.
  useEffect(() => {
    if (notice === null) return;
    const handle = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(handle);
  }, [notice]);

  const armedDefinition = armedType ? (lookupNode(armedType) ?? null) : null;

  // The canvas owns the transform and publishes it here; the gestures convert
  // pointer positions with exactly the numbers the canvas drew with.
  const [viewport, setViewport] = useState<CanvasViewport>(IDENTITY_VIEWPORT);

  const gestures = useEditorGestures({
    scene,
    viewport,
    armedDefinition,
    armedCount,
    onPlaced: onDisarm,
    onNotice: notify,
  });

  // Where the pointer last was, in world coordinates — paste lands here.
  const pointerWorld = useRef<Point>({ x: 0, y: 0 });

  // Shared by the inspector's two halves: the box drawn in world coordinates
  // inside the canvas, and the popover placed against it from outside.
  const inspectorAnchorRef = useRef<HTMLDivElement>(null);
  const inspectorBounds = useMemo(
    () => selectionBounds(scene, selection),
    [scene, selection],
  );

  useEditorShortcuts({
    pointerWorld: () => pointerWorld.current,
    onCommandMenu: () => setCommandMenuOpen(true),
    onEscape: () => {
      if (armedType) {
        onDisarm();
        return true;
      }
      if (gestures.isWiring) {
        gestures.cancelWiring();
        return true;
      }
      return false;
    },
    onNotice: notify,
  });

  const faulted = useMemo(() => {
    const nodes = new Set<string>();
    const wires = new Set<string>();
    for (const diagnostic of diagnostics) {
      for (const id of diagnostic.nodeIds ?? []) nodes.add(id);
      for (const id of diagnostic.wireIds ?? []) wires.add(id);
    }
    return { nodes, wires };
  }, [diagnostics]);

  const contentBounds = useMemo(() => sceneBounds(scene), [scene]);

  const placeFromMenu = useCallback((definition: NodeDefinition) => {
    // The command menu has no click to place at, so it uses wherever the
    // pointer last was — which is where the user is looking.
    const nodeId = placeNode(definition, pointerWorld.current);
    if (nodeId) selectOnly([nodeId]);
  }, []);

  return (
    <>
      <Canvas
        title={document?.name ?? "No circuit open"}
        showGrid={showGrid}
        showMinimap={showMinimap}
        defaultZoom={document?.defaultZoom}
        // The loaded document's id, not `projectId`: the two differ for the
        // render between asking for a project and the store having it, and
        // re-framing then would use the outgoing circuit's zoom.
        viewKey={document?.id ?? ""}
        contentBounds={contentBounds}
        themeKey={themeKey}
        cursor={gestures.cursor}
        onViewportChange={setViewport}
        onTitleChange={
          document ? (name) => renameOpenDocument(name) : undefined
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onContentPointerDown={gestures.onPointerDown}
        onContentPointerMove={(event) => {
          // Tracked on every move, not only during a gesture: paste and the
          // command menu both place at "where the pointer is".
          pointerWorld.current = viewport.toWorld({
            x: event.clientX,
            y: event.clientY,
          });
          gestures.onPointerMove(event);
        }}
        onContentPointerUp={gestures.onPointerUp}
        onContentPointerLeave={gestures.onPointerLeave}
        overlay={
          <>
            <RunControls
              diagnosticsOpen={diagnosticsOpen}
              onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
              onNotice={notify}
            />

            {diagnosticsOpen && (
              <DiagnosticsPanel
                onClose={() => setDiagnosticsOpen(false)}
                onFocusElements={(nodeIds, wireIds) =>
                  selectOnly(nodeIds, wireIds)
                }
              />
            )}

            {/* An example is fully editable, so nothing else on screen would
                tell the user their edits are going nowhere. */}
            {ephemeral && (
              <p className="pointer-events-none absolute top-14 left-4 z-20 rounded-md border border-dashed border-border bg-sidebar px-2 py-1 text-[11px] text-muted-foreground">
                Example — edits are not saved. Import it from the sidebar to
                keep them.
              </p>
            )}

            {notice && (
              <p
                // `aria-live` rather than `role="status"`: the same
                // announcement, without claiming a landmark on a floating
                // toast that comes and goes.
                aria-live="polite"
                className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-sidebar px-3 py-1.5 text-xs shadow-md"
              >
                {notice}
              </p>
            )}

            {armedDefinition && (
              <p className="pointer-events-none absolute top-14 left-1/2 z-20 -translate-x-1/2 rounded-md bg-sidebar px-2 py-1 text-[11px] text-muted-foreground">
                Click the canvas to place {armedCount} {armedDefinition.title}
                {armedCount > 1 ? "s" : ""} · right-click the palette entry for
                fewer · Esc to cancel
              </p>
            )}
          </>
        }
      >
        <WireLayer
          scene={scene}
          selectedWireIds={selection.wireIds}
          faultedWireIds={faulted.wires}
          pending={gestures.pendingWire}
          waypointGhost={gestures.waypointGhost}
          band={gestures.band}
        />
        {armedDefinition && gestures.ghostCenters && (
          <GhostLayer
            definition={armedDefinition}
            centers={gestures.ghostCenters}
          />
        )}
        <NodeLayer
          scene={scene}
          selectedNodeIds={selection.nodeIds}
          faultedNodeIds={faulted.nodes}
          interactive={document !== null}
          compatiblePinIds={gestures.compatiblePinIds}
          wiring={gestures.isWiring}
          onSelectNode={(nodeId) => selectOnly([nodeId])}
          onPinActivate={gestures.activatePin}
        />
        {/* Only the anchor lives in the transformed layer, so the inspector
            can be placed against the selection's real on-screen box. The
            popover itself is rendered below, outside the canvas. */}
        <InspectorAnchor
          bounds={inspectorBounds}
          anchorRef={inspectorAnchorRef}
        />
      </Canvas>

      {/* Outside `<Canvas>` on purpose: a portal bubbles its events up the
          React tree, so a popup mounted under the canvas would feed every
          click in the form to the canvas pointer handlers, which would
          hit-test empty space and clear the selection it is editing. */}
      <Inspector bounds={inspectorBounds} anchorRef={inspectorAnchorRef} />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        onPlace={placeFromMenu}
      />
    </>
  );
}

/**
 * World-space extent of everything drawn, for the minimap. Null when the
 * circuit is empty, which is what tells the minimap to frame the viewport
 * instead.
 */
function sceneBounds(scene: Scene): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of Object.values(scene.nodes)) {
    minX = Math.min(minX, node.bounds.x);
    minY = Math.min(minY, node.bounds.y);
    maxX = Math.max(maxX, node.bounds.x + node.bounds.width);
    maxY = Math.max(maxY, node.bounds.y + node.bounds.height);
  }

  // Wires too, so a hand-routed detour that leaves the nodes' box is still in
  // frame rather than being clipped out of the preview.
  for (const wire of Object.values(scene.wires)) {
    for (const point of wire.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
