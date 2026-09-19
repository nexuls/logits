# 0013. The canvas transform is a style, not a CSS variable

Status: Accepted
Date: 2026-09-19

Supersedes the mechanism named in
[0003](0003-dom-nodes-svg-wires.md) — the decision there (DOM nodes over one
shared transform) stands; only how the transform reaches the layer changes.

## Context

The canvas published its pan and zoom as three inherited custom properties —
`--canvas-x`, `--canvas-y`, `--canvas-zoom` — set on the container, and the
transformed layer read them back:

```css
transform: translate(var(--canvas-x), var(--canvas-y)) scale(var(--canvas-zoom));
```

It reads well, and it made the transform inspectable from anywhere in the
subtree. It is also the most expensive thing the app did.

A custom property is inherited, so changing one invalidates style for every
element that inherits it. The browser cannot know the value only ever feeds a
`transform`: any descendant might be using it in a width, a padding or a font
size, so the subtree is relayed out. A `transform` written on the element
itself is a composited property and relayouts nothing.

Panning is the change, and it happens every frame. Measured on the 2,000-node
board `bench-circuit.ts` generates, 40 frames of panning cost:

| Written each frame | Layout over 40 frames |
| --- | --- |
| `--canvas-y` on the container | 9,044 ms |
| `transform` on the layer | 9 ms |
| nothing (idle control) | 9 ms |

Writing the transform directly is indistinguishable from not moving at all.

The cost scaled with the DOM, which is what made it a scale problem rather
than a slow frame — per whole pan gesture, before and after:

| Nodes | DOM elements | Layout before | Layout after |
| --- | --- | --- | --- |
| 100 | 1,319 | 828 ms | 41 ms |
| 500 | 5,699 | 3,487 ms | 41 ms |
| 2,000 | 22,128 | 13,813 ms | 37 ms |

Nothing outside `src/components/canvas/index.tsx` ever read the three
properties.

## Decision

The transformed layer carries its own `transform` style, computed from the
same `scale` and `offset` state as before. The three custom properties are
gone.

## Consequences

- Layout during a pan no longer grows with the circuit. It is flat at about
  40 ms per gesture at every size measured.
- Viewport culling of rendering, which [0003](0003-dom-nodes-svg-wires.md)
  held in reserve for exactly this, is not needed and has not been built.
  Culling would have reduced the cost of each relayout; this removes the
  relayout. It would also have made the node layer re-render on every pan
  frame, which today it does not do at all.
- A consumer that wants the live transform takes it from `onViewportChange`,
  which already publishes it, rather than reading CSS. There is no longer a
  way to get at it from a stylesheet — no caller wanted one.
- The rule that there is exactly one pan/zoom implementation is unchanged.
  This is that implementation, writing its transform a different way.
