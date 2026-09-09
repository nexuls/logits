# Node catalog

The agreed contract for each node: registry `type`, pin ids, and parameters.
Pin ids are part of the save format — treat this table as frozen once a node
ships.

Everything in this file now exists in `src/lib/nodes/registry.ts`, appears in
the palette, and simulates. The one thing that is *not* finished is the
authoring surface for subcircuits — see the note at the bottom of the file.

Each node's *prose* — what it is for, how it behaves at the edges, the circuits
it belongs in — lives on the definition as `docs`, and reaches users through the
info button on its palette entry. This file stays the frozen contract; see
[05-node-authoring-guide.md](05-node-authoring-guide.md) for what a `docs` page
should cover.

Conventions: inputs left, outputs right, `clk` bottom, `en`/`rst`/`load` top,
and `sel`/`op` bottom beside the clock, because they select rather than flow
through. `n` = the node's `width` parameter. All widths default to 1 unless
noted.

Two conventions decide what an *unwired* pin means, and both are
[ADR 0009](decisions/0009-z-is-idle-on-a-control-pin.md): an unwired `rst`,
`set`, `load` or `oe` reads `Z` and is **not asserted**; an unwired `en` reads
`Z` and **enables**. A transition into or out of `Z` is never a clock edge.

## Gates — `gate.*`

| type | pins in | pins out | params |
| --- | --- | --- | --- |
| `gate.and` `gate.or` `gate.nand` `gate.nor` `gate.xor` `gate.xnor` | `in0`…`inN` | `out` | `inputs` 2–8, `width` |
| `gate.not` `gate.buffer` | `in` | `out` | `width` |
| `gate.tristate` | `in`, `en` (1 bit) | `out` | `width` — drives `Z` when `en` is 0 |

## Sources and sinks — `io.*`

| type | pins | params / behaviour |
| --- | --- | --- |
| `io.switch` | `out` | `width`, state `value`; click toggles a bit |
| `io.button` | `out` | momentary; `pressed`, high while held |
| `io.constant` | `out` | `width`, `value` |
| `io.led` | `in` | `color`; renders off / on / `X` (red) / `Z` (grey) |
| `io.probe` | `in` | shows the value as text in binary/hex/decimal |

## Timing — `time.*`

| type | pins | params |
| --- | --- | --- |
| `time.clock` | `out`, `en` (top) | `periodNs`, `dutyCycle` (%), `startHigh`. Held low it stops scheduling entirely |
| `time.oneshot` | `in` → `out` | `widthNs`, `edge`: rising/falling/both |
| `time.delay` | `in` → `out` | `delayNs` |

## Sequential — `seq.*`

| type | pins in | pins out | params |
| --- | --- | --- | --- |
| `seq.dff` | `d`, `clk`, `rst`, `set`, `en` | `q`, `qn` | `edge`, `asyncReset`, `width` |
| `seq.jkff` | `j`, `k`, `clk`, `rst` | `q`, `qn` | `edge` |
| `seq.tff` | `t`, `clk`, `rst` | `q`, `qn` | `edge` |
| `seq.latch` | `d`, `en` | `q`, `qn` | `width`; level-sensitive, and an unresolved `en` is `X` rather than "enabled" — it is the latch's only control |
| `seq.register` | `d`, `clk`, `rst`, `en` | `q` | `edge`, `asyncReset`, `width` |
| `seq.counter` | `clk`, `en`, `rst`, `load`, `d` | `q`, `carry` | `width`, `direction`, `modulus` (0 = the full range) |

`seq.dff` and `seq.register` are one implementation with two pin sets; so are
`seq.jkff` and `seq.tff`. `seq.counter` resets asynchronously and counts on the
rising edge; `carry` marks the terminal count, so chaining is `carry` into the
next stage's `en`.

Uninitialised outputs are `X` until reset or first clock — see
[04-simulation-engine.md](04-simulation-engine.md).

## Combinational blocks — `comb.*`

| type | pins in | pins out | params |
| --- | --- | --- | --- |
| `comb.mux` | `in0`…`inN`, `sel` (bottom) | `out` | `selectBits` 1–4, `width` |
| `comb.demux` | `in`, `sel` (bottom) | `out0`…`outN` | `selectBits` 1–4, `width`; unselected outputs are driven low |
| `comb.decoder` | `in`, `en` | `out0`…`outN` | `inputBits` 1–5 |
| `comb.encoder` | `in0`…`inN` | `out`, `valid` | `outputBits` 1–4, `priority` |
| `comb.adder` | `a`, `b`, `cin` | `sum`, `cout` | `width`; an unwired `cin` is no carry |
| `comb.comparator` | `a`, `b` | `lt`, `eq`, `gt` | `width`, `signed` |
| `comb.alu` | `a`, `b`, `op` (3 bits, bottom) | `out`, `zero`, `carry`, `overflow` | `width` |

The ALU's `op` codes are frozen with the pin ids, because they are what a saved
circuit drives: `0` ADD, `1` SUB, `2` AND, `3` OR, `4` XOR, `5` NOT A,
`6` shift A left, `7` shift A right. `carry` on a shift is the bit shifted out;
`overflow` is signed overflow and is `0` for every logical op.

The adder works lane by lane through the gate tables rather than through
`fromBits`, so a controlling value still settles the lanes it can: `X0 + 00` is
`X0`, not `XX`. The comparator is deliberately all-or-nothing — `lt`/`eq`/`gt`
are properties of the whole word — and answers `X` on all three if either
operand has an unresolved bit.

## Memory — `mem.*`

| type | pins | params |
| --- | --- | --- |
| `mem.rom` | `addr`, `en` (top) → `data` (tri-state) | `addressBits` 1–12, `width`, `contents` |
| `mem.ram` | `addr`, `we`/`oe` (top), `clk` (bottom), `data` (inout) | `addressBits`, `width`, `synchronous`, `contents` |

`contents` is a hex image in the document: whitespace- or comma-separated
words, lowest address first, anything unlisted reading 0. It is forgiving by
design — a stray token leaves a zero rather than failing, because `evaluate`
has no way to report a parse error.

RAM contents are **runtime state**, re-created from `contents` on every reset
exactly like a flip-flop's stored bit; a write during the run does not edit the
document. There is no `persistContents`: a memory that rewrote the document as
it ran would put one undo entry on the stack per clock edge.

The RAM never drives `data` while `we` is asserted, whatever `oe` says — that
is how a real part avoids shorting itself during a write.

## Instruments — `scope.*`, `disp.*`

| type | pins | notes |
| --- | --- | --- |
| `scope.logic` | `ch0`…`chN` | ring-buffer waveform view; params `channels` 1–8, `timeSpanNs`, `triggerChannel` (`-1` free-runs), `triggerEdge` |
| `disp.sevenseg` | `a`…`g`, `dp` **or** `value` (4-bit), `dp` | params `mode`: `raw` / `bcd`, `commonAnode` |
| `disp.hex` | `in` | shows a `width`-bit value as hex digits |
| `disp.bargraph` | `in` | one lamp per bit, `width` 1–16, `color` |

`scope.logic` is the only node that calls `emitSample`, and its `delayNs` is
zero so a sample lands at the instant the net moved rather than a reaction time
later — a scope that skewed every trace by its own delay would be useless for
the setup-and-hold questions it exists to answer.

`disp.hex` reuses the probe's `readout` view rather than owning one: both
display one net's value, which is the point of keying views by behaviour rather
than by node type.

Every other element in this catalog names `view: "block"` — a rectangle with
its name in it — and writes the schematic abbreviation there (`MUX`, `DEMUX`,
`DFF`, `REG`, `CMP`) through `NodeDefinition.shortTitle`, while the tables
above, the palette and the help keep the full title. Footprints are not
hand-tuned against those names: `defineNode` widens or raises a body that
cannot set its name on one line, which is why `comb.demux`, `seq.counter`,
`bus.split` and `bus.merge` are wider than their `size()` asks for.

## Structure — `bus.*`, `sub.*`

| type | pins | notes |
| --- | --- | --- |
| `bus.split` | `in` → `out0`…`outN` | `groups` |
| `bus.merge` | `in0`…`inN` → `out` | `groups`; the inverse of split |
| `bus.tunnel` | `io` (inout) | `name`, `width`; tunnels sharing a name are one net, with no wire |
| `sub.<key>` | derived from the chip's port nodes | an instance of `document.subcircuits[key]` |
| `sub.port` | `io` (inout) | `name`, `direction`, `width`; marks a boundary pin inside a chip |

`groups` is comma-separated lane counts, least significant first — `"4,4"` cuts
an eight-bit bus into two nibbles. The bus width is the **sum** of the groups
rather than a separate param, so a split and the merge that undoes it cannot be
configured into disagreeing.

`bus.tunnel` has no `evaluate` at all. The join is made by `buildNetlist`
through the `netAliases` contract, so two tunnels are genuinely one net rather
than a pair of buffers pretending to be one.

There is no `sub.instance`: an instance's `type` is `sub.<key>`, and its
definition is derived from the document rather than built into the app — see
[ADR 0010](decisions/0010-subcircuits-are-derived-node-types.md), which also
covers why a port's own pin is `inout`. The model, the flattening and the
simulation are done and tested. What does **not** exist yet is the authoring
surface: nothing in the editor can make a chip out of a selection or open one
to edit, so a `sub.<key>` node can only arrive today in a hand-written or
imported document.
