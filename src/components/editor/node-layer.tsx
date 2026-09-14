"use client";

import { memo } from "react";

import { groupId } from "@/lib/circuit/groups";
import { isEnclosure, paintOrder, type Scene } from "@/state/scene";
import CircuitNode from "./circuit-node";

type Props = {
  scene: Scene;
  /**
   * Which nodes this pass draws: the enclosures, which the editor renders
   * beneath the wires, or everything else, above them.
   */
  layer: "enclosures" | "circuit";
  selectedNodeIds: readonly string[];
  faultedNodeIds: ReadonlySet<string>;
  interactive: boolean;
  /** Pin names per `NodeDefinition.kind`; two flags, not one object, so the
   * memo above still compares by value. */
  showBasicPinLabels: boolean;
  showCompoundPinLabels: boolean;
  /** The node under the cursor, which reveals its floating pin labels. */
  hoveredNodeId: string | null;
  /** The node being edited on the canvas, if any. */
  editingNodeId: string | null;
  /** `nodeId/pinId` keys the wire in progress could land on. */
  compatiblePinIds: ReadonlySet<string>;
  /** True while a wire is being drawn, which is when the highlight applies. */
  wiring: boolean;
  onSelectNode: (nodeId: string) => void;
  onPinActivate: (nodeId: string, pinId: string) => void;
};

/**
 * Every node in one layer, absolutely positioned in world coordinates.
 *
 * Drawn in `paintOrder` so the stacking is stable — and so it matches what
 * `nodeAt` in `hit-test.ts` calls "topmost", which is the last one drawn.
 * Without that agreement a click could select a node that is visibly behind
 * another.
 */
function NodeLayer({
  scene,
  layer,
  selectedNodeIds,
  faultedNodeIds,
  interactive,
  showBasicPinLabels,
  showCompoundPinLabels,
  hoveredNodeId,
  editingNodeId,
  compatiblePinIds,
  wiring,
  onSelectNode,
  onPinActivate,
}: Props) {
  const selected = new Set(selectedNodeIds);

  // Selecting one member of a group — a tunnel — lights up the rest of it,
  // since nothing else on the sheet shows what a named net is joined to.
  const selectedGroups = new Set<string>();
  for (const id of selectedNodeIds) {
    const resolved = scene.nodes[id];
    const group = resolved && groupId(resolved.node, resolved.def);
    if (group) selectedGroups.add(group);
  }
  const linked = (id: string) => {
    if (selectedGroups.size === 0 || selected.has(id)) return false;
    const { node, def } = scene.nodes[id];
    const group = groupId(node, def);
    return group !== null && selectedGroups.has(group);
  };

  return (
    <>
      {paintOrder(scene)
        .filter(
          (id) => isEnclosure(scene.nodes[id]) === (layer === "enclosures"),
        )
        .map((id) => (
          <CircuitNode
            key={id}
            resolved={scene.nodes[id]}
            selected={selected.has(id)}
            linked={linked(id)}
            faulted={faultedNodeIds.has(id)}
            interactive={interactive}
            showBasicPinLabels={showBasicPinLabels}
            showCompoundPinLabels={showCompoundPinLabels}
            hovered={id === hoveredNodeId}
            editing={id === editingNodeId}
            resizable={
              selectedNodeIds.length === 1 &&
              selected.has(id) &&
              scene.nodes[id].def.resize !== undefined
            }
            compatiblePinIds={compatiblePinIds}
            wiring={wiring}
            onFocus={() => onSelectNode(id)}
            onPinActivate={(pinId) => onPinActivate(id, pinId)}
          />
        ))}
    </>
  );
}

export default memo(NodeLayer);
