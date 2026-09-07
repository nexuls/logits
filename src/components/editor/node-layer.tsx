"use client";

import { memo } from "react";

import type { Scene } from "@/state/scene";
import CircuitNode from "./circuit-node";

type Props = {
  scene: Scene;
  selectedNodeIds: readonly string[];
  faultedNodeIds: ReadonlySet<string>;
  interactive: boolean;
  /** `nodeId/pinId` keys the wire in progress could land on. */
  compatiblePinIds: ReadonlySet<string>;
  /** True while a wire is being drawn, which is when the highlight applies. */
  wiring: boolean;
  onSelectNode: (nodeId: string) => void;
  onPinActivate: (nodeId: string, pinId: string) => void;
};

/**
 * Every node, absolutely positioned in world coordinates.
 *
 * Sorted by id so the paint order is stable — and so it matches what
 * `nodeAt` in `hit-test.ts` calls "topmost", which is the last one drawn.
 * Without that agreement a click could select a node that is visibly behind
 * another.
 */
function NodeLayer({
  scene,
  selectedNodeIds,
  faultedNodeIds,
  interactive,
  compatiblePinIds,
  wiring,
  onSelectNode,
  onPinActivate,
}: Props) {
  const selected = new Set(selectedNodeIds);

  return (
    <>
      {Object.keys(scene.nodes)
        .sort()
        .map((id) => (
          <CircuitNode
            key={id}
            resolved={scene.nodes[id]}
            selected={selected.has(id)}
            faulted={faultedNodeIds.has(id)}
            interactive={interactive}
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
