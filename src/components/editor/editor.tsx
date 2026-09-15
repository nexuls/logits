"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Canvas from "@/components/canvas";
import {
  type CanvasViewport,
  IDENTITY_VIEWPORT,
} from "@/components/canvas/canvas-viewport";
import DeleteProjectDialog from "@/components/projects/delete-project-dialog";
import {
  downloadCircuit,
  importCircuitFile,
} from "@/components/projects/project-actions";
import { snapPointToGrid } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  closeDocument,
  openDocument,
  placeNode,
  renameOpenDocument,
  shiftOpenDocument,
  useDocument,
  useIsEphemeral,
} from "@/state/document";
import { endInPlaceEdit, useEditingNodeId } from "@/state/in-place-edit";
import { createProject, createProjectFrom } from "@/state/projects-store";
import { buildScene, sceneClusters } from "@/state/scene";
import { pruneSelection, selectOnly, useSelection } from "@/state/selection";
import { getNetlist, syncDocument, useDiagnostics } from "@/state/simulation";
import CommandMenu from "./command-menu";
import DiagnosticsPanel from "./diagnostics-panel";
import GhostLayer from "./ghost-layer";
import Inspector, { InspectorAnchor, selectionBounds } from "./inspector";
import KeyboardShortcutsDialog from "./keyboard-shortcuts-dialog";
import NodeLayer from "./node-layer";
import PerformanceMonitor from "./performance-monitor";
import ProjectMenu from "./project-menu";
import RunControls from "./run-controls";
import SettingsDialog, { type SettingsSection } from "./settings-dialog";
import { useEditorGestures } from "./use-editor-gestures";
import { useEditorShortcuts } from "./use-editor-shortcuts";
import { useViewPersistence } from "./use-view-persistence";
import WireLayer from "./wire-layer";

type Props = {
  projectId: string;
  showGrid: boolean;
  showMinimap: boolean;
  /** Pin names on elements whose pins are obvious from their shape. */
  showBasicPinLabels: boolean;
  /** Pin names on elements whose pins are told apart only by name. */
  showCompoundPinLabels: boolean;
  themeKey: string;
  /** Node type armed by the palette, or null. */
  armedType: string | null;
  /** How many copies the next canvas click drops. */
  armedCount: number;
  onDisarm: () => void;
  /** Opens another project — what New, Duplicate and Import end on. */
  onSelectProject: (projectId: string) => void;
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
  showBasicPinLabels,
  showCompoundPinLabels,
  themeKey,
  armedType,
  armedCount,
  onDisarm,
  onSelectProject,
}: Props) {
  const document = useDocument();
  const ephemeral = useIsEphemeral();
  const selection = useSelection();
  const diagnostics = useDiagnostics();
  const editingNodeId = useEditingNodeId();

  const [notice, setNotice] = useState<string | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("preferences");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [titleEditing, setTitleEditing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

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

  // A note removed while it is being edited — deleted, or undone away — ends
  // its session, so bringing it back does not reopen the editor.
  useEffect(() => {
    if (editingNodeId && !document?.nodes[editingNodeId]) {
      endInPlaceEdit(editingNodeId);
    }
  }, [document, editingNodeId]);

  const netlist = getNetlist();
  // The document's own chips are node types as far as the scene is concerned,
  // so the canvas resolves them through the same lookup the engine does.
  const documentLookup = useMemo(
    () => (document ? subcircuitLookup(document, lookupNode) : lookupNode),
    [document],
  );
  const scene = useMemo(
    () =>
      document
        ? buildScene(document, documentLookup, netlist?.pinToNet)
        : { nodes: {}, wires: {} },
    [document, documentLookup, netlist],
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

  // Where this circuit was last left, and where it is left next. An example
  // is not persisted for the same reason its edits are not (ADR 0008).
  const { restoredView, saveView } = useViewPersistence(
    document?.id ?? null,
    !ephemeral,
  );

  const onViewportChange = useCallback(
    (next: CanvasViewport) => {
      setViewport(next);
      saveView({ scale: next.scale, offset: next.offset });
    },
    [saveView],
  );

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
    onShortcutsHelp: () => setShortcutsOpen(true),
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

  // One box per connected group, not one around everything: the minimap draws
  // them separately, and the canvas fits the preview to their union.
  const contentGroups = useMemo(() => sceneClusters(scene), [scene]);

  const placeFromMenu = useCallback((definition: NodeDefinition) => {
    // The command menu has no click to place at, so it uses wherever the
    // pointer last was — which is where the user is looking.
    const nodeId = placeNode(definition, pointerWorld.current);
    if (nodeId) selectOnly([nodeId]);
  }, []);

  const newProject = () => {
    const result = createProject();
    if (!result.ok) {
      notify(result.error);
      return;
    }
    onSelectProject(result.id);
    // Straight into a rename, as New in the sidebar does: the name is the
    // first thing anyone changes.
    setTitleEditing(true);
  };

  const duplicateOpen = () => {
    if (!document) return;
    // The document in the editor, not the stored copy, so edits still waiting
    // on the autosave come along — and an example, which is never stored, can
    // be copied at all.
    const result = createProjectFrom(document);
    if (!result.ok) {
      notify(result.error);
      return;
    }
    onSelectProject(result.id);
    notify(ephemeral ? "Saved to your projects." : "Duplicated.");
  };

  // Moves the circuit by the view's offset and pans the view back by the same
  // amount, so nothing jumps on screen but "reset view" now lands here. The
  // shift is snapped so nodes stay on the grid; the view keeps the sub-grid
  // remainder, which is why it pans by the snapped delta and not to zero.
  const setViewAsOrigin = () => {
    if (!document) return;
    const { scale, offset } = viewport;
    const worldDelta = snapPointToGrid({
      x: offset.x / scale,
      y: offset.y / scale,
    });
    if (worldDelta.x === 0 && worldDelta.y === 0) {
      notify("The view is already at the origin.");
      return;
    }
    shiftOpenDocument(worldDelta);
    viewport.panBy(-worldDelta.x * scale, -worldDelta.y * scale);
    notify("This view is now the origin.");
  };

  const importFile = () =>
    importCircuitFile((result) => {
      notify(result.message);
      if (result.ok) onSelectProject(result.id);
    });

  const exportOpen = () => {
    if (document) downloadCircuit(document);
  };

  const openSettings = (section: SettingsSection) => {
    setSettingsSection(section);
    setSettingsOpen(true);
  };

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
        restoredView={restoredView}
        contentGroups={contentGroups}
        themeKey={themeKey}
        cursor={gestures.cursor}
        onViewportChange={onViewportChange}
        onTitleChange={
          document ? (name) => renameOpenDocument(name) : undefined
        }
        titleEditing={titleEditing}
        onTitleEditingChange={setTitleEditing}
        headerMenu={
          <ProjectMenu
            hasDocument={document !== null}
            ephemeral={ephemeral}
            onNewProject={newProject}
            onRename={() => setTitleEditing(true)}
            onDuplicate={duplicateOpen}
            onSetViewAsOrigin={setViewAsOrigin}
            onImport={importFile}
            onExport={exportOpen}
            onOpenSettings={openSettings}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onDelete={() =>
              document &&
              setPendingDelete({ id: document.id, name: document.name })
            }
          />
        }
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
        onContentDoubleClick={gestures.onDoubleClick}
        overlay={
          <>
            <RunControls
              diagnosticsOpen={diagnosticsOpen}
              onToggleDiagnostics={() => setDiagnosticsOpen((open) => !open)}
              performanceOpen={performanceOpen}
              onTogglePerformance={() => setPerformanceOpen((open) => !open)}
              onImport={importFile}
              onExport={exportOpen}
              onNotice={notify}
            />

            {/* One column for the bottom-right corner, so the diagnostics
                panel stacks above the performance monitor instead of both
                claiming the corner. It passes presses through where it is
                empty; its children opt back in. */}
            <div className="pointer-events-none absolute top-14 right-0 bottom-0 z-20 flex flex-col items-end justify-end gap-2">
              {diagnosticsOpen && (
                <DiagnosticsPanel
                  onClose={() => setDiagnosticsOpen(false)}
                  onFocusElements={(nodeIds, wireIds) =>
                    selectOnly(nodeIds, wireIds)
                  }
                />
              )}
              <PerformanceMonitor
                expanded={performanceOpen}
                onToggle={() => setPerformanceOpen((open) => !open)}
              />
            </div>

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
        {/* Enclosures first, beneath the wires: a group frames the circuit,
            and one painted over it would hide the parts it is labelling. */}
        <NodeLayer
          layer="enclosures"
          scene={scene}
          selectedNodeIds={selection.nodeIds}
          faultedNodeIds={faulted.nodes}
          interactive={document !== null}
          showBasicPinLabels={showBasicPinLabels}
          showCompoundPinLabels={showCompoundPinLabels}
          hoveredNodeId={gestures.hoveredNodeId}
          editingNodeId={editingNodeId}
          compatiblePinIds={gestures.compatiblePinIds}
          wiring={gestures.isWiring}
          onSelectNode={(nodeId) => selectOnly([nodeId])}
          onPinActivate={gestures.activatePin}
        />
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
          layer="circuit"
          scene={scene}
          selectedNodeIds={selection.nodeIds}
          faultedNodeIds={faulted.nodes}
          interactive={document !== null}
          showBasicPinLabels={showBasicPinLabels}
          showCompoundPinLabels={showCompoundPinLabels}
          hoveredNodeId={gestures.hoveredNodeId}
          editingNodeId={editingNodeId}
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
      <Inspector
        bounds={inspectorBounds}
        anchorRef={inspectorAnchorRef}
        // Out of the way while a note is edited in place: the edit is on the
        // canvas, and the popover would sit over the text being typed.
        suppressed={gestures.isInteracting || editingNodeId !== null}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
      />

      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      {/* Nothing to select afterwards: the page moves off a project that is
          no longer in the list. */}
      <DeleteProjectDialog
        project={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={(result) => {
          if (!result.ok) notify(result.error);
        }}
      />

      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        onPlace={placeFromMenu}
      />
    </>
  );
}
