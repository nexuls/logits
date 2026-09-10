import {
  boolParam,
  defineNode,
  intParam,
  type NodeParams,
  stringParam,
} from "@/lib/nodes/define";
import { createSignal, HIGH, LOW, toBits } from "@/lib/sim/logic";
import { boundedParam, stack, widthOf, widthParam } from "../shared";

/**
 * A pad of momentary keys that drives the value of whichever one is held.
 *
 * The keys are a text param rather than a fixed 0–9 layout, because the pad a
 * circuit needs is rarely the pad a phone has: a hex pad is `0…F`, a vending
 * machine is `A,B,C,1,2,3`, and a two-key pad is a pair of buttons that share
 * an output. The labels are also the values — a label that reads as a number
 * *is* that number — so the obvious keypad needs no configuring at all.
 */

const DEFAULT_KEYS = "0,1,2,3,4,5,6,7,8,9";
const MAX_KEYS = 32;
const MAX_COLUMNS = 8;
export const MAX_KEYS_LENGTH = 256;

/** No key is held. `pressed` is momentary, exactly like `io.button`'s. */
export const NO_KEY = -1;

export type KeypadKey = { label: string; value: number };

/**
 * The pad's keys, in reading order.
 *
 * A key's value is its label read as a number — decimal or `0x` hex — and its
 * position when the label is not a number at all, so `A,B,C` is 0, 1, 2. The
 * view lays these out and the `evaluate` drives them, from this one list.
 */
export function keypadKeys(params: NodeParams): KeypadKey[] {
  const labels = stringParam(params, "keys", DEFAULT_KEYS)
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .slice(0, MAX_KEYS);

  const keys = labels.length > 0 ? labels : DEFAULT_KEYS.split(",");
  return keys.map((label, index) => {
    const parsed = /^0x[0-9a-f]+$/i.test(label)
      ? Number.parseInt(label.slice(2), 16)
      : /^\d+$/.test(label)
        ? Number.parseInt(label, 10)
        : Number.NaN;

    return { label, value: Number.isFinite(parsed) ? parsed : index };
  });
}

export function keypadColumns(params: NodeParams): number {
  return boundedParam(params, "columns", 3, 1, MAX_COLUMNS);
}

/** Grid shape, in keys — the view's layout and the body's footprint agree. */
export function keypadGrid(params: NodeParams): {
  columns: number;
  rows: number;
} {
  const columns = keypadColumns(params);
  return {
    columns,
    rows: Math.max(1, Math.ceil(keypadKeys(params).length / columns)),
  };
}

/** Three grid cells to a key, plus a cell of bezel on each side. */
function bodySize(params: NodeParams) {
  const { columns, rows } = keypadGrid(params);
  return {
    width: Math.max(6, columns * 3 + 2),
    height: Math.max(6, rows * 3 + 2),
  };
}

export const keypadNode = defineNode({
  type: "io.keypad",
  docs: `
A pad of momentary keys — 0–9 as it comes — that drives the value of whichever
key is held, with a strobe saying that one is.

## Behaviour

Press a key and \`OUT\` takes its value while \`VLD\` goes high; let go and
\`VLD\` falls. What \`OUT\` does on release is **Latch**: held, it keeps the
last key pressed, which is what makes the pad readable by eye and by a
register that clocks on \`VLD\`; unlatched, it falls back to zero, so a key is
only ever on the bus while it is down.

**Keys** is a comma-separated list, and it is where the pad stops being a
number pad. A label that reads as a number *is* that number — \`0x0A\` and
\`10\` are the same key — and a label that does not, like \`ENT\`, takes its
position in the list as its value. **Columns** wraps the list into a grid, so
\`0…9\` in 3 columns is a phone pad and \`0…F\` in 4 is a hex pad.

Nothing is debounced, because nothing here bounces. A real pad does, and
\`time.oneshot\` on \`VLD\` is the fix a real one needs.

Only one key is down at a time: pressing a second releases the first, which is
what a two-key rollover would have to model and this deliberately does not.

## Typical uses

- Entering an address or an operand by hand, with \`VLD\` clocking a
  \`seq.register\` so the value lands only on a real press.
- A hex pad — \`0,1,2,3,4,5,6,7,8,9,A,B,C,D,E,F\` in 4 columns — into
  \`disp.sevenseg\` or \`comb.segdriver\`.
- A function pad whose labels are words: \`RUN,STOP,STEP\` gives 0, 1, 2 on
  \`OUT\` and a strobe on \`VLD\`, which \`comb.decoder\` turns back into one
  line per command.
- Any place a row of \`io.button\` would otherwise share one output through a
  bank of tri-states.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a key to press it; \`Tab\` reaches each key and \`Space\` presses it.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Keypad",
  icon: "keypad",
  category: "io",
  keywords: ["keypad", "keyboard", "keys", "input", "digits", "hex", "entry"],
  defaultParams: {
    keys: DEFAULT_KEYS,
    columns: 3,
    width: 4,
    latch: true,
    pressed: NO_KEY,
    value: 0,
  },
  view: "keypad",
  paramsSchema: [
    {
      key: "keys",
      label: "Keys",
      kind: "text",
      maxLength: MAX_KEYS_LENGTH,
      hint: "Comma-separated labels. A numeric label is its own value.",
    },
    {
      key: "columns",
      label: "Columns",
      kind: "int",
      min: 1,
      max: MAX_COLUMNS,
    },
    widthParam("Width of the value the pad drives."),
    {
      key: "latch",
      label: "Latch",
      kind: "bool",
      hint: "Hold the last key's value after release.",
    },
  ],
  pins: (params) => {
    const { height } = bodySize(params);

    return stack(
      [
        {
          id: "out",
          name: "OUT",
          direction: "out" as const,
          width: widthOf(params),
        },
        { id: "valid", name: "VLD", direction: "out" as const, width: 1 },
      ],
      "right",
      height,
    );
  },
  size: bodySize,
  evaluate: (ctx) => {
    const keys = keypadKeys(ctx.params);
    const width = widthOf(ctx.params);
    const pressed = intParam(ctx.params, "pressed", NO_KEY);
    const held = pressed >= 0 && pressed < keys.length;

    // The latched value is a param rather than state: a pad left showing the
    // last key entered is part of the circuit the user saved, and it has to
    // undo and reload with everything else.
    const value = held
      ? keys[pressed].value
      : boolParam(ctx.params, "latch", true)
        ? intParam(ctx.params, "value", 0)
        : 0;

    ctx.write("out", toBits(value, width));
    ctx.write("valid", createSignal(1, held ? HIGH : LOW));
  },
});
