# Node catalog

The agreed contract for each node: registry `type`, pin ids, and parameters.
Pin ids are part of the save format — treat this table as frozen once a node
ships. Everything here is **Planned** until the node exists in
`src/lib/nodes/registry.ts`.

Conventions: inputs left, outputs right, `clk` bottom, `en`/`rst` top.
`n` = the node's `width` parameter. All widths default to 1 unless noted.

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
| `io.button` | `out` | momentary; high while pressed |
| `io.constant` | `out` | `width`, `value` |
| `io.led` | `in` | `color`; renders off / on / `X` (red) / `Z` (grey) |
| `io.probe` | `in` | shows the value as text in binary/hex/decimal |

## Timing — `time.*`

| type | pins | params |
| --- | --- | --- |
| `time.clock` | `out`, `en` (top) | `frequencyHz` or `periodNs`, `dutyCycle`, `startHigh` |
| `time.oneshot` | `in` → `out` | `widthNs`, `edge`: rising/falling/both |
| `time.delay` | `in` → `out` | `delayNs` |

## Sequential — `seq.*`

| type | pins in | pins out | params |
| --- | --- | --- | --- |
| `seq.dff` | `d`, `clk`, `rst`, `set`, `en` | `q`, `qn` | `edge`, `asyncReset`, `width` |
| `seq.jkff` | `j`, `k`, `clk`, `rst` | `q`, `qn` | `edge` |
| `seq.tff` | `t`, `clk`, `rst` | `q`, `qn` | `edge` |
| `seq.latch` | `d`, `en` | `q`, `qn` | level-sensitive |
| `seq.register` | `d`, `clk`, `en`, `rst` | `q` | `width` |
| `seq.counter` | `clk`, `en`, `rst`, `load`, `d` | `q`, `carry` | `width`, `direction`, `modulus` |

Uninitialised outputs are `X` until reset or first clock — see
[04-simulation-engine.md](04-simulation-engine.md).

## Combinational blocks — `comb.*`

| type | pins in | pins out | params |
| --- | --- | --- | --- |
| `comb.mux` | `in0`…`inN`, `sel` | `out` | `selectBits`, `width` |
| `comb.demux` | `in`, `sel` | `out0`…`outN` | `selectBits`, `width` |
| `comb.decoder` | `in`, `en` | `out0`…`outN` | `inputBits` |
| `comb.encoder` | `in0`…`inN` | `out`, `valid` | `outputBits`, `priority` |
| `comb.adder` | `a`, `b`, `cin` | `sum`, `cout` | `width` |
| `comb.comparator` | `a`, `b` | `lt`, `eq`, `gt` | `width`, `signed` |
| `comb.alu` | `a`, `b`, `op` | `out`, `zero`, `carry`, `overflow` | `width`, op table |

## Memory — `mem.*`

| type | pins | params |
| --- | --- | --- |
| `mem.rom` | `addr` → `data`, `en` | `addressBits`, `width`, `contents` (hex string in the document) |
| `mem.ram` | `addr`, `data` (inout), `we`, `oe`, `clk` | `addressBits`, `width`, `synchronous` |

RAM contents are runtime state, not document state, unless `persistContents` is set.

## Instruments — `scope.*`, `disp.*`

| type | pins | notes |
| --- | --- | --- |
| `scope.logic` | `ch0`…`chN` | ring-buffer waveform view; params `channels`, `timeSpanNs`, `triggerChannel`, `triggerEdge` |
| `disp.sevenseg` | `a`…`g`, `dp` **or** `value` (4-bit) + `mode` | params `mode`: `raw` / `bcd`, `commonAnode` |
| `disp.hex` | `in` | shows `width`-bit value as hex digits |
| `disp.bargraph` | `in` | one LED per bit |

## Structure — `bus.*`, `sub.*`

| type | pins | notes |
| --- | --- | --- |
| `bus.split` | `in` → `out0`…`outN` | `width`, split points |
| `bus.merge` | `in0`…`inN` → `out` | inverse of split |
| `bus.tunnel` | `io` | named net; same `name` joins nets without a wire |
| `sub.instance` | derived from the subcircuit's port nodes | phase 4 |
| `sub.port` | `in`/`out` | marks a boundary pin inside a subcircuit definition |
