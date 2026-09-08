"use client";

import { memo } from "react";

import { nodeIcon } from "@/components/nodes/node-icons";
import { GRID_SIZE, rotateSize, snapPointToGrid } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";

type Props = {
  definition: NodeDefinition;
  /** World centres the batch would land on, from the gestures hook. */
  centers: readonly Point[];
};

/**
 * The preview of what the armed palette element will drop, under the cursor.
 *
 * It draws from the definition alone — size, icon, title — so a new node
 * previews without this file changing (Non-negotiable #4). Every box is placed
 * at the *snapped* top-left the command will use, not at the raw pointer, so
 * the ghost sits exactly where the node will: the preview is the promise.
 *
 * Decorative and inert: `aria-hidden`, no pointer events. The keyboard path is
 * the palette's own count control and the "click to place" hint in the editor
 * overlay, both of which are real text.
 */
function GhostLayer({ definition, centers }: Props) {
  const size = rotateSize(definition.size(definition.defaultParams), 0);
  const width = size.width * GRID_SIZE;
  const height = size.height * GRID_SIZE;
  const Icon = nodeIcon(definition.icon);

  return (
    <div aria-hidden className="pointer-events-none">
      {centers.map((center) => {
        const topLeft = snapPointToGrid({
          x: center.x - width / 2,
          y: center.y - height / 2,
        });

        return (
          <div
            key={`${topLeft.x}/${topLeft.y}`}
            className="absolute flex items-center justify-center rounded-[4px] border-2 border-primary border-dashed bg-primary/10 text-primary opacity-70"
            style={{ left: topLeft.x, top: topLeft.y, width, height }}
          >
            <Icon className="size-1/2" />
          </div>
        );
      })}
    </div>
  );
}

export default memo(GhostLayer);
