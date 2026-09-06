# 0003. DOM nodes, one SVG wire layer, one shared transform

Status: Accepted
Date: 2026-09-06

## Context

The canvas could be drawn entirely with `<canvas>` (fastest, but every control,
label and focus ring must be reimplemented), entirely with SVG, or as DOM nodes
over a shared transform.

The viewport already establishes a single transformed layer driven by
`--canvas-x`, `--canvas-y`, `--canvas-zoom`.

## Decision

Nodes are absolutely-positioned DOM elements inside that transformed layer.
Wires are drawn in **one** SVG element in the same layer, in world coordinates.
Screen-space overlays (selection handles, drag preview, minimap) live outside
the transform. Nodes that display fast-changing data (oscilloscope, displays)
own a private `<canvas>` inside their DOM body.

## Consequences

- shadcn controls, text inputs, tooltips, focus and ARIA work inside nodes with
  no reimplementation — a large accessibility win.
- One SVG for all wires keeps the element count proportional to wires, not
  wires × segments, and lets hit-testing use a single spatial index.
- Cost: DOM node count grows with circuit size. Mitigation is viewport culling
  of rendering (never of simulation), if a profile shows it is needed.
- Rules out a second, independent pan/zoom implementation anywhere in the app.
