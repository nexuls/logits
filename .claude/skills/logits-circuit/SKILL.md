---
name: logits-circuit
description: Design, build, wire, annotate, validate and screenshot logic circuits for Logits as .logits.json documents. Use when asked to create, draw, lay out or fix a circuit, schematic or example (src/example), to route wires with waypoints and tunnels, to add groups and notes, or to test or screenshot a circuit live in the browser with Playwright.
---

# Building Logits circuits

A circuit is a `.logits.json` document (save format v4, schema in
`src/lib/circuit/schema.ts`). You write the JSON directly, then prove it three
ways: `check.ts` (loads, netlist, layout lint), `simulate.ts` (the real engine,
headless), and the Playwright spec (the real app, screenshots you then look at).

**Run everything from the repo root.** Bun resolves the `@/` alias from the
root `tsconfig.json`; from anywhere else the scripts fail to import. All paths
below are relative to the repo root; `K=.claude/skills/logits-circuit`.

## 0. Know the parts

```bash
.claude/skills/logits-circuit/scripts/gen-node-docs.sh
```

Regenerates `nodes/` from the live definitions in `src/lib/nodes/` (<1 s; run
it at the start, the committed copy can be stale). Read `nodes/README.md`, then
open only the `nodes/<type>.md` files for parts you will place — each has the
node JSON, params with allowed values, pins with offsets, and behaviour.

Pins and footprints change with params and rotation (a block body widens to
fit its title), so never guess them. Ask:

```bash
bun .claude/skills/logits-circuit/scripts/pins.ts gate.and '{"inputs":3}' 0 300 200
bun .claude/skills/logits-circuit/scripts/pins.ts bus.tunnel '{"name":"CLK"}' 180 500 200
bun .claude/skills/logits-circuit/scripts/pins.ts --doc path/to/circuit.json S1 Y0 --wires
```

Output gives each pin's world point **and its stub** — the point 10 units out
from the body where every wire turns. `--doc --wires` prints the routed
polyline of every wire, which is what you debug routing with.

## 1. The document

```json
{
  "version": 4, "id": "d_my_circuit", "name": "My circuit",
  "defaultZoom": 1,
  "nodes": {
    "n_a":   { "id": "n_a", "type": "io.switch", "position": { "x": 120, "y": 230 }, "label": "A", "params": { "width": 1, "value": 0 } },
    "n_and": { "id": "n_and", "type": "gate.and", "position": { "x": 290, "y": 220 }, "params": { "inputs": 2, "width": 1 } }
  },
  "wires": {
    "w_a":  { "id": "w_a", "from": { "nodeId": "n_a", "pinId": "out" }, "to": { "nodeId": "n_and", "pinId": "in0" }, "waypoints": [{ "x": 190, "y": 250 }] },
    "w_a2": { "id": "w_a2", "from": { "wireId": "w_a", "waypoint": 0 }, "to": { "nodeId": "n_and", "pinId": "in1" }, "waypoints": [{ "x": 190, "y": 270 }] }
  }
}
```

- Keys of `nodes`/`wires` equal their `id`. Readable ids (`n_sum`, `w_rail_en`) are fine, ≤ 64 chars.
- `position` is the node's top-left in world units; **everything on the 10-unit grid**, waypoints too.
- `from` is the driver (output/inout pin) or a **branch**: `{ wireId, waypoint }` starts at that wire's `waypoint`-th bend. `to` is always a reader pin.
- Give every source, sink and instrument a short `label`. Params missing fall back to defaults; unknown keys are ignored — `check.ts` flags both typos and out-of-range values.

## 2. Wiring that reads cleanly

A wire is exactly: pin → stub → your waypoints in order → far stub → pin,
straight segments at **any angle**. Nothing is auto-routed. So:

1. **Lay out left to right in columns** (inputs → logic stages → outputs), 60–100 units between columns. Place nodes so pins that connect share a `y`; then the wire needs no waypoints.
2. **Orthogonal only.** Each waypoint shares `x` or `y` with the point before it — including the stubs (pin ± 10). A wire between offset pins gets two waypoints: `(midX, fromY)`, `(midX, toY)`.
3. **Fan-out = branches**, not parallel wires from one pin. Put a waypoint on the trunk at the tap point (it may sit on a straight run), then branch from `{ wireId, waypoint: i }`. The editor draws a junction dot there.
4. **Rails** for a signal many inputs need: one wire runs down a column with a waypoint at each tap height and ends on the last reader; every other reader branches off horizontally. Waypoint indices count the corner(s) before the taps.
5. **Stagger turn columns**: two wires turning at the same `x` over overlapping `y` ranges merge visually. Space parallel runs ≥ 10 apart (20 reads better).
6. **Never** put a bend or pin of one net on another net's segment (reads as a connection), run two nets along the same line, or cross a node body. Perpendicular crossings are fine.
7. Pins are 20 apart on most bodies, so there is exactly one free track between neighbouring pins.

Copy routing from `reference/decoder-2to4.json` and `src/example/full-adder.json`. Do **not** copy `half-adder`, `mux-2to1` or the calculator's routing — they contain diagonal wires.

## 3. Tunnels

`bus.tunnel` nodes with the same `name` are one net with no wire. Use them when
a signal leaves its stage/group, travels > ~400 units, fans out to many
distant readers (clock, reset, enable), or when routing it would add crossings.

- Rotation `0`: pin on the **left**, receives a wire from a driver on its left. Rotation `180`: pin on the **right**, feeds readers to its right.
- Names short and uppercase (`CLK`, `EN`, `S1N`); every name appears on ≥ 2 tunnels, all the same `width`.
- Keep tunnels horizontal. Turned 90/270 the body is 40 wide and names over 2 characters are clipped (`S1N` → `S..`). To feed a vertical rail, staircase horizontal tunnels and corner each wire down into its rail, the rightmost rail fed from the top tunnel, so feeds never cross.
- Don't tunnel a wire you could draw straight inside one stage — a hidden connection costs readability too.

## 4. Annotations

Follow the pattern every shipped example uses:

- One outer `deco.group`, colour `teal`, `fontSize` 16, `title` = circuit name, `subtitle` = one-line summary, framing the whole board.
- One inner group per stage, `fontSize` 11, tinted by role: `blue` what the user operates, `green`/`amber` logic, `red` arithmetic, `purple` outputs and waveforms, `pink` sequencing. Groups nest or sit apart, never partly overlap.
- A group header takes ~40 units at size 11 with a subtitle, ~50 at size 16: keep the first node below it (`check.ts` flags `on-group-header`). Every circuit node sits wholly inside some inner group.
- `deco.text` notes in free space inside the outer group, never over wires or parts (they paint above wires): first `## Try it` with what to click, then one `### Heading` note per idea. **A blank line inside a note renders as nothing** — write one paragraph or a bullet list per note, and use several notes rather than one long one. **A bullet that wraps to a second line renders as an empty bullet with its text dropped underneath**: keep every bullet to one line (about 40 characters in a 31-cell note at font size 12), or use a paragraph.
- Labels on switches/LEDs must differ from group titles.
- The preview opens at the **origin**, not fitted: start content near `(80, 110)` and keep it inside 1600×1000 at `defaultZoom` — `check.ts` prints the zoom to set if it does not fit.

## 5. Verify — in this order

```bash
bun .claude/skills/logits-circuit/scripts/check.ts .claude/skills/logits-circuit/reference/decoder-2to4.json --strict
bun .claude/skills/logits-circuit/scripts/simulate.ts .claude/skills/logits-circuit/reference/decoder-2to4.json --truth EN,S1,S0 --watch Y0,Y1,Y2,Y3
bun .claude/skills/logits-circuit/scripts/simulate.ts src/example/sr-latch.json --steps .claude/skills/logits-circuit/reference/sr-latch.steps.json
```

Substitute your own circuit and steps file; these are the reference ones.

- `check.ts`: errors = the app would drop elements or the netlist is wrong (width mismatch, multiple drivers, unknown pin). Warnings = unreadable layout. Get to `0 error(s), 0 warning(s)`; exit 1 otherwise with `--strict`.
- `orthogonalise.ts <circuit.json> [--write]` squares `diagonal-wire` warnings off for you, one elbow or one Z-route per diagonal, scored against the whole board so the fix does not land a run on top of another net. It only inserts waypoints, so the netlist is untouched — but read the before/after counts it prints and re-run `check.ts`: on a crowded board a squared-off route can still end up crossing a body.
- `simulate.ts --truth` enumerates switch values (≤ 16 input bits) and exits 1 on any `X`/`Z` output. `--steps` runs an ordered list on one engine, so latches and counters keep state; `runNs` advances clocks. With no mode it settles and prints every labelled part's pins.

Steps file (shared by `simulate.ts` and Playwright):

```json
[
  { "name": "set", "set": { "Set": 1, "Reset": 0 }, "expect": { "Q": "1", "Q'": "0" } },
  { "name": "hold after set", "set": { "Set": 0 }, "runNs": 100, "expect": { "Q": "1", "Q'": "0" } },
  { "name": "reset", "set": { "Reset": 1 }, "expect": { "Q": "0", "Q'": "1" } },
  { "name": "hold after reset", "set": { "Reset": 0 }, "expect": { "Q": "0", "Q'": "1" } }
]
```

`set` names a node by label (or id): `"Set": 1` sets its `value`; `"Label.param": x` sets any other param (headless only). `expect` reads the node's only/input pin, or `"Label.pin"`; a string is bits MSB-first, a number is compared as decimal. `runNs` (default 50) advances simulated time after the sets — that is how clocks tick.

### Live in the browser (Playwright)

```bash
LOGITS_CIRCUIT=.claude/skills/logits-circuit/reference/decoder-2to4.json \
LOGITS_STEPS=.claude/skills/logits-circuit/reference/decoder-2to4.steps.json \
  bunx playwright test -c .claude/skills/logits-circuit/e2e/playwright.config.ts
LOGITS_EXAMPLE=d_oAusJaF1x0yN LOGITS_STEPS=.claude/skills/logits-circuit/reference/sr-latch.steps.json \
  bunx playwright test -c .claude/skills/logits-circuit/e2e/playwright.config.ts
```

An example's id is the `"id"` at the top of its file in `src/example/` (`d_oAusJaF1x0yN` is the SR latch).

- Starts `bun run dev --port 3123` itself, or reuses one already there. `LOGITS_BASE_URL` targets another server.
- `LOGITS_EXAMPLE=<document id>` uses **`/preview/example/<id>`** (least overhead), falling back to `/preview#data=<encoded document>` only if that route 404s — which it does for an id that is not in the shipped catalog; `LOGITS_CIRCUIT` always uses the data link. `bun .claude/skills/logits-circuit/scripts/link.ts file.json http://localhost:3123` prints that link for manual use.
- Test 1 fails on page errors or any diagnostic (`LOGITS_ALLOW_WARNINGS=1` tolerates warnings) and writes `e2e/shots/<name>.png` (plus `-diagnostics.png` with the panel open on failure). Test 2 replays the steps by clicking switches and reading pins, one screenshot per step.
- **Open the screenshots with Read and look at them.** The linter cannot see clipped names, notes that overflow their box, labels colliding with wires, or a board that is merely ugly. Fix and re-run until it looks like the shipped examples.
- The UI can only click **1-bit `io.switch`** nodes; anything else (`Label.param`, multi-bit values, buttons, keypads) belongs in `simulate.ts --steps` only. The preview runs at 1 µs/s, so `runNs` ≈ milliseconds of waiting — keep live steps short.

## Shipping it as an example

Save it as `src/example/<name>.json`, then add an import and a
`{ raw, summary }` entry to `CATALOG` in `src/example/index.ts`, where
`fromJson` validates it at load — an example with any load issue is silently
dropped from the catalog, so run `check.ts` first. Update
`artifacts/08-roadmap.md` in the same change.

## Gotchas

- Scripts outside the repo root, or `node` instead of `bun`, fail on `@/` imports. The root `tsconfig.json` does not include `.claude/`; typecheck this skill with `bunx tsc --noEmit -p .claude/skills/logits-circuit`.
- `@playwright/test` is pinned to **1.49.1** to match the Chromium build cached in `~/.cache/ms-playwright` (revision 1148). Upgrading needs `bunx playwright install chromium`. `expect.poll(...).toSatisfy` does not exist in this version.
- Groups render `role="img"` with aria-label `"Title: subtitle"`, the same shape as an LED's `"Label: value"`, so a loose `getByRole("img", { name: /Sum/ })` matches both. The spec reads each node's focus button instead: `"<label> (<Type>), pins: <id> <bits>, …"`.
- The Next dev-tools "N" bubble shows in the top-right of dev screenshots; it is not part of the circuit.
- A wire whose `to` pin does not exist is kept but unroutable (`unknown-pin`); a branch naming a missing wire is **dropped on load** (`dangling-wire`), which `check.ts` reports as an error.
- Inserting a waypoint before a tapped one shifts every branch index after it — when editing a trunk by hand, re-number its branches.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Property 'toSatisfy' not found` from Playwright | Poll a normalised value and use `.toBe` (see `e2e/circuit.spec.ts`). |
| `WARN tunnel-name-clipped` | Rotate the tunnel to 0/180 and bend the wire, or shorten the name to 2 characters. |
| `WARN group-overlap` between the outer and an inner group | Widen/heighten the outer group until it contains the inner one. |
| `WARN false-junction` | A bend sits on another net's wire; move one of them a track (10–20 units) over. |
| `no io.switch labelled "Reset.value" to click` in Playwright | The UI only flips 1-bit switches by label; keep `Label.param` and multi-bit sets for `simulate.ts --steps`. |
| An empty `•` with the text on the next line in a note | That bullet wraps; shorten it to one line. |
| `expected one part labelled "X", found 0` in Playwright | The label is on a decoration, or not on the node; labels must be unique across parts. |
