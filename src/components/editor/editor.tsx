"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Canvas from "@/components/canvas";
import {
  type CanvasViewport,
  IDENTITY_VIEWPORT,
} from "@/components/canvas/canvas-viewport";
import DeleteProjectDialog from "@/components/projects/delete-project-dialog";
import {
  copyCircuitLink,
  downloadCircuit,
  importCircuitFile,
} from "@/components/projects/project-actions";
import type { Selection } from "@/lib/circuit/commands";
import { snapPointToGrid } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import { outerElementId } from "@/lib/circuit/subcircuit";
import { subcircuitPreview } from "@/lib/circuit/subcircuit-commands";
import type { NodeDefinition } from "@/lib/nodes/define";
import {
  closeDocument,
  createSubcircuitFromSelection,
  openDocument,
  placeNode,
  renameOpenDocument,
  shiftOpenDocument,
  subcircuitInstances,
  updateNodeParams,
  useDocument,
  useDocumentLookup,
  useIsEphemeral,
  useRootDocument,
  useSubcircuitPath,
} from "@/state/document";
import { withEnclosedNodes } from "@/state/hit-test";
import { endInPlaceEdit, useEditingNodeId } from "@/state/in-place-edit";
import { createProject, createProjectFrom } from "@/state/projects-store";
import { buildScene, sceneClusters } from "@/state/scene";
import {
  getSelection,
  pruneSelection,
  selectOnly,
  useSelection,
} from "@/state/selection";
import { getNetlist, syncDocument, useDiagnostics } from "@/state/simulation";
import CommandMenu from "./command-menu";
import DeviceWarningDialog from "./device-warning-dialog";
import DiagnosticsPanel from "./diagnostics-panel";
import GhostLayer from "./ghost-layer";
import Inspector, { InspectorAnchor, selectionBounds } from "./inspector";
import KeyboardShortcutsDialog from "./keyboard-shortcuts-dialog";
import NodeLayer from "./node-layer";
import PerformanceMonitor from "./performance-monitor";
import ProjectMenu from "./project-menu";
import RunControls from "./run-controls";
import SettingsDialog, { type SettingsSection } from "./settings-dialog";
import ShareButton from "./share-button";
import SubcircuitBreadcrumb from "./subcircuit-breadcrumb";
import { SubcircuitNameDialog } from "./subcircuit-dialogs";
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
  /** The value written on multi-bit wires. */
  showBusValues: boolean;
  themeKey: string;
  /** Node type armed by the palette, or null. */
  armedType: string | null;
  /** How many copies the next canvas click drops. */
  armedCount: number;
  onDisarm: () => void;
  /** Opens another project — what New, Duplicate and Import end on. */
  onSelectProject: (projectId: string) => void;
  /**
   * Replays the first-run welcome. The onboarding itself is mounted by the
   * page, which is the only thing above both sidebars the tour points at.
   */
  onOpenWelcome: () => void;
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
  showBusValues,
  themeKey,
  armedType,
  armedCount,
  onDisarm,
  onSelectProject,
  onOpenWelcome,
}: Props) {
  const document = useDocument();
  // The project, and the trail of chips into it. `document` is the chip while
  // one is open, so anything that is the *project's* — its id, its chips, the
  // zoom it opens at — has to read this one instead.
  const project = useRootDocument();
  const subcircuitPath = useSubcircuitPath();
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
  /** Set while the create-a-chip prompt is open, holding what it will say. */
  const [creating, setCreating] = useState<{
    nodes: number;
    ports: number;
  } | null>(null);
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
  // The project's own chips are node types as far as the scene is concerned,
  // so the canvas resolves them through the same lookup the engine does.
  const documentLookup = useDocumentLookup();
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

  // Through the document's lookup, not the registry: a chip is a type this
  // project defines, and arming one has to resolve it like any other.
  const armedDefinition = armedType
    ? (documentLookup(armedType) ?? null)
    : null;

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

  /**
   * What goes into the chip: the selection, plus the contents of any group in
   * it that carries them.
   *
   * A group selected on its own is the whole stage it frames as far as the
   * user is concerned — that is already what dragging one does — so making a
   * chip of it must take the circuit inside and not just the empty frame.
   */
  const selectionForSubcircuit = useCallback((): Selection => {
    const selection = getSelection();
    return { nodeIds: withEnclosedNodes(scene, selection.nodeIds) };
  }, [scene]);

  // Asks for a name first, and says what the selection will become: how many
  // parts move into the chip, and how many pins its boundary produces. Both
  // come from the same function that will do the work, so the prompt cannot
  // promise an interface the chip does not get.
  const promptForSubcircuit = useCallback(() => {
    if (!document) return;

    const selection = selectionForSubcircuit();
    const preview = subcircuitPreview(document, documentLookup, selection);
    if (preview.nodes === 0) {
      notify("Select the parts to turn into a subcircuit first.");
      return;
    }
    setCreating(preview);
  }, [document, documentLookup, notify, selectionForSubcircuit]);

  const makeSubcircuit = (name: string) => {
    const result = createSubcircuitFromSelection(
      selectionForSubcircuit(),
      name,
    );
    if (!result) {
      notify("That selection could not be made into a subcircuit.");
      return;
    }

    // The instance, so the next thing the user does acts on what they made.
    selectOnly([result.instanceId]);
    const pins = result.ports.length;
    notify(
      `“${name}” created with ${pins} ${pins === 1 ? "pin" : "pins"}. Edit its contents from the Subcircuits palette.`,
    );
  };

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
    onMakeSubcircuit: promptForSubcircuit,
    // Everything in the open document, decorations included: a group and a
    // note are elements you can move and delete, so leaving them out would
    // make Ctrl+A followed by a drag quietly rearrange the circuit inside its
    // own frame. Taken from the scene rather than the document so it is what
    // is on screen — inside a chip, the chip's contents.
    onSelectAll: () =>
      selectOnly(Object.keys(scene.nodes), Object.keys(scene.wires)),
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

  // Diagnostics name elements by their *netlist* id, and a fault inside a chip
  // names `instance/gate`, which this document does not contain. Trimming to
  // the outermost segment marks the instance the fault is in, which is the
  // nearest thing the canvas can actually draw.
  const faulted = useMemo(() => {
    const nodes = new Set<string>();
    const wires = new Set<string>();
    for (const diagnostic of diagnostics) {
      for (const id of diagnostic.nodeIds ?? []) nodes.add(outerElementId(id));
      for (const id of diagnostic.wireIds ?? []) wires.add(outerElementId(id));
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

  // The document in the editor, so an example and unsaved edits are shared
  // as they are on screen.
  const shareOpen = () => {
    if (document)
      copyCircuitLink(document).then(({ message }) => notify(message));
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
        // The project's, not the open chip's: "reset view" means the same
        // thing wherever in the circuit the user is.
        defaultZoom={project?.defaultZoom}
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
            onCopyLink={shareOpen}
            onOpenSettings={openSettings}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenWelcome={onOpenWelcome}
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

            <ShareButton disabled={document === null} onShare={shareOpen} />

            {/* One column for the bottom-right corner, so the diagnostics
                panel stacks above the performance monitor instead of both
                claiming the corner. It passes presses through where it is
                empty; its children opt back in. */}
            {/* Flush in the corner at every width — the status bar is drawn to
                sit there. The toolbar rail stops short of the bottom rather
                than this stepping aside for it; only the panels that open
                upward into the rail's band inset, and they do it themselves.
                Lifted off the bottom below 48rem, where the minimap has the
                corner to itself. */}
            <div className="pointer-events-none absolute top-14 right-0 bottom-0 z-20 flex flex-col items-end justify-end gap-2 @max-[48rem]/canvas:bottom-36">
              {diagnosticsOpen && (
                <DiagnosticsPanel
                  onClose={() => setDiagnosticsOpen(false)}
                  onFocusElements={(nodeIds, wireIds) =>
                    // Outermost segment, for the same reason `faulted` uses
                    // it: a fault inside a chip can only select the instance.
                    selectOnly(
                      nodeIds.map(outerElementId),
                      wireIds.map(outerElementId),
                    )
                  }
                />
              )}
              <PerformanceMonitor
                expanded={performanceOpen}
                onToggle={() => setPerformanceOpen((open) => !open)}
              />
            </div>

            {/* Both banners in one column rather than each claiming its own
                corner: they can be on screen together, and side by side they
                overlapped as soon as the canvas was narrow enough for the
                centred one to reach the left edge. */}
            <div className="pointer-events-none absolute top-14 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-col items-center gap-1 @max-[64rem]/canvas:max-w-[calc(100%-8rem)]">
              {/* First in the column: it says which document the canvas is
                  showing, which the two below it qualify rather than
                  replace. It takes pointer events (the rest of the column
                  does not) because it is the way back out. */}
              {project && subcircuitPath.length > 0 && (
                <SubcircuitBreadcrumb
                  project={project}
                  path={subcircuitPath}
                  instances={subcircuitInstances(
                    subcircuitPath[subcircuitPath.length - 1],
                  )}
                />
              )}

              {/* A chip runs on its own while it is open — there is no parent
                  circuit driving its input ports — so every output reads `Z`
                  until something inside drives it. Without saying so, the
                  honest behaviour reads as a broken circuit. */}
              {subcircuitPath.length > 0 && (
                <p className="rounded-md border border-dashed border-border bg-sidebar px-2 py-1 text-center text-[11px] text-muted-foreground">
                  Editing the definition. Its input ports are not driven here,
                  so they read Z until this circuit is placed in another one.
                </p>
              )}

              {/* An example is fully editable, so nothing else on screen would
                  tell the user their edits are going nowhere. */}
              {ephemeral && (
                <p className="rounded-md border border-dashed border-border bg-sidebar px-2 py-1 text-center text-[11px] text-muted-foreground">
                  Example — edits are not saved. Use Save to projects in the ⋯
                  menu to keep them.
                </p>
              )}

              {armedDefinition && (
                <p className="rounded-md bg-sidebar px-2 py-1 text-center text-[11px] text-muted-foreground">
                  Click the canvas to place {armedCount} {armedDefinition.title}
                  {armedCount > 1 ? "s" : ""} · right-click the palette entry
                  for fewer · Esc to cancel
                </p>
              )}
            </div>

            {notice && (
              <p
                // `aria-live` rather than `role="status"`: the same
                // announcement, without claiming a landmark on a floating
                // toast that comes and goes.
                aria-live="polite"
                // Lifted clear of the minimap on a narrow canvas, where a
                // centred toast reaches the bottom-left corner.
                className="pointer-events-none absolute bottom-4 left-1/2 z-30 max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md bg-sidebar px-3 py-1.5 text-center text-xs shadow-md @max-[48rem]/canvas:bottom-40"
              >
                {notice}
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
          onSetNodeParams={updateNodeParams}
        />
        <WireLayer
          scene={scene}
          selectedWireIds={selection.wireIds}
          faultedWireIds={faulted.wires}
          pending={gestures.pendingWire}
          waypointGhost={gestures.waypointGhost}
          band={gestures.band}
          showBusValues={showBusValues}
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
          onSetNodeParams={updateNodeParams}
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
        onMakeSubcircuit={promptForSubcircuit}
        // Out of the way while a note is edited in place: the edit is on the
        // canvas, and the popover would sit over the text being typed.
        suppressed={gestures.isInteracting || editingNodeId !== null}
      />

      {/* Mounted only while open, so the field starts from the suggested name
          each time rather than from the last chip the user made. */}
      {creating && (
        <SubcircuitNameDialog
          open
          onOpenChange={(next) => {
            if (!next) setCreating(null);
          }}
          title="New subcircuit"
          description={`${creating.nodes} ${creating.nodes === 1 ? "part" : "parts"} move into it, and its boundary becomes ${creating.ports} ${creating.ports === 1 ? "pin" : "pins"}.`}
          initialName="Chip"
          submitLabel="Create"
          onSubmit={makeSubcircuit}
        />
      )}

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

      {/* Decides for itself whether this device needs telling; rendering it
          unconditionally keeps the queries in one file. */}
      <DeviceWarningDialog />

      <CommandMenu
        open={commandMenuOpen}
        onOpenChange={setCommandMenuOpen}
        onPlace={placeFromMenu}
        onMakeSubcircuit={promptForSubcircuit}
      />
    </>
  );
}
