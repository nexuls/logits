import {
  boolParam,
  defineNode,
  type NodeParams,
  stringParam,
} from "@/lib/nodes/define";
import { detectEdge, NO_LEVEL } from "@/lib/nodes/edges";
import {
  createSignal,
  HIGH,
  LOW,
  type LogicValue,
  toBits,
  X,
} from "@/lib/sim/logic";
import { boundedParam, controlState, stack, stackHeight } from "../shared";
import {
  EXIT_CHORDS,
  encodeKey,
  encodingOf,
  type KeyCode,
  type KeyEvent,
} from "./keyboard-codes";

/**
 * A PC keyboard: the user types into the element, and the circuit reads the
 * keys back out one byte at a time.
 *
 * Keystrokes reach the engine the way every other user input does — through
 * params and a command (artifacts/05-node-authoring-guide.md) — but as an
 * *event log* rather than a level. A level cannot carry typing: two keys
 * pressed between frames, or a press and release with no simulated time
 * between them, collapse into one param write and the circuit never sees the
 * first. Each logged event has a sequence number, and `evaluate` takes every
 * event newer than the last one it consumed, so nothing coalesces away.
 *
 * What the circuit has not read yet is a FIFO in `state`, which a reset
 * forgets — the keys already typed are history, not a queue to replay.
 */

export const DATA_WIDTH = 8;

/** Most recent events kept in params; older ones have long been consumed. */
export const EVENT_LOG = 64;

const DEFAULT_DEPTH = 16;
const MAX_DEPTH = 64;
const DEFAULT_PULSE_NS = 10;
const MAX_PULSE_NS = 1_000_000_000;

export type Protocol = "handshake" | "strobe";

function protocolOf(params: NodeParams): Protocol {
  return stringParam(params, "protocol", "handshake") === "strobe"
    ? "strobe"
    : "handshake";
}

/** Out-of-band release flag: PS/2 carries a release in band, as `F0`. */
function hasBreakPin(params: NodeParams): boolean {
  return (
    boolParam(params, "releases", false) &&
    encodingOf(params.encoding) !== "ps2"
  );
}

/**
 * The logged key events, oldest first. Params are JSON, so a hand-edited file
 * can hold anything; an entry that is not a well-formed event is dropped
 * rather than fed to the encoder.
 */
export function keyEvents(params: NodeParams): KeyEvent[] {
  const raw = params.events;
  if (!Array.isArray(raw)) return [];

  const events: KeyEvent[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const { seq, code, key, up, ctrl } = entry as Record<string, unknown>;
    if (typeof seq !== "number" || !Number.isFinite(seq)) continue;
    if (typeof code !== "string" || typeof key !== "string") continue;
    events.push({ seq, code, key, up: up === true, ctrl: ctrl === true });
  }
  return events.sort((a, b) => a.seq - b.seq);
}

export function lastSeqOf(events: readonly KeyEvent[]): number {
  return events.reduce((last, event) => Math.max(last, event.seq), 0);
}

type KeyboardState = {
  /** Highest `seq` already moved into the FIFO. */
  lastSeq: number;
  fifo: KeyCode[];
  overflow: boolean;
  /** A contended `RD` or `CLR` may or may not have acted; cleared by `CLR`. */
  unknown: boolean;
  lastRd: LogicValue | typeof NO_LEVEL;
  /** Strobe mode: the pulse is `high`, then a `gap` of the same width. */
  phase: "idle" | "high" | "gap";
  phaseEnd: number;
  /** Strobe mode: the byte on `D`, held through its pulse and after it. */
  shown: KeyCode | null;
};

function bodySize(params: NodeParams) {
  const right = hasBreakPin(params) ? 4 : 3;
  return { width: 12, height: Math.max(6, stackHeight(right)) };
}

function freshState(params: NodeParams): KeyboardState {
  return {
    // What is already in the log when the engine is built was typed into an
    // earlier run; a reset or a reload must not type it again.
    lastSeq: lastSeqOf(keyEvents(params)),
    fifo: [],
    overflow: false,
    unknown: false,
    lastRd: NO_LEVEL,
    phase: "idle",
    phaseEnd: 0,
    shown: null,
  };
}

export const keyboardNode = defineNode({
  type: "io.keyboard",
  docs: `
A PC keyboard for the circuit. Click the element and type: every key goes into
a buffer, and the circuit reads it out one byte at a time on \`D\`.

## Capturing and letting go

Clicking the element (or \`Enter\` on it) **captures** the keyboard. While it
is captured every key goes to the circuit and none reaches the editor — not
\`Space\`, not \`Delete\`, not \`Ctrl+Z\` — and the face says *Typing* with the
exit chord beneath it. Press the **Exit key** to hand the keyboard back:
\`Esc\` by default, or \`Shift+Esc\` / \`Ctrl+]\` when the circuit needs to
receive \`Esc\` itself. Clicking anywhere else, or switching away from the
window, lets go too. Keys still held when capture ends are released, so the
circuit never sees a stuck key.

A typing session is one undo step, and undoing it does not un-read what the
circuit already took: typed keys are events, and events have happened.

## Encoding

- **ASCII** — the character typed, 7-bit, in the low bits of \`D\`. Enter is
  CR (\`0x0D\`), Backspace \`0x08\`, Tab \`0x09\`, Esc \`0x1B\`, Delete
  \`0x7F\`, and Ctrl with a letter is its control code (Ctrl+C is \`0x03\`).
  Keys with no ASCII — arrows, Shift on its own, \`é\` — produce nothing.
- **USB HID** — the Keyboard page usage ID of the physical key, the code a USB
  keyboard reports: \`A\` is \`0x04\`, Enter \`0x28\`, the arrows
  \`0x4F\`–\`0x52\`, the modifiers \`0xE0\`–\`0xE7\`. Layout-independent.
- **PS/2 (Set 2)** — the scan code bytes a PS/2 keyboard puts on the wire:
  \`A\` is \`1C\`, extended keys are prefixed \`E0\`, and with **Report
  releases** on a release is \`F0\` then the code. Each byte is its own entry
  in the buffer.

**Report releases** also adds a \`BRK\` output for ASCII and HID: it is high
while the byte on \`D\` came from a key being let go.

## Transfer protocols

**Handshake** (ready/valid), the default. \`VLD\` is high whenever the buffer
holds a byte, and \`D\` shows the oldest one. The reader takes it and pulses
\`RD\`: the rising edge removes that byte, and \`D\` moves on to the next or
drops to zero with \`VLD\`. Nothing is lost however slowly the circuit reads,
up to **Buffer depth** bytes.

**Strobe**. There is no \`RD\`: the keyboard puts each byte on \`D\` and
pulses \`VLD\` high for **Strobe width** ns, waits the same again, and moves
on. \`D\` holds its last byte afterwards. Wire \`VLD\` to a register's clock
and it loads every key — as long as the register is faster than the strobe.

In both, when the buffer is full a new key is dropped and \`OVF\` latches high.
\`CLR\` high empties the buffer and clears \`OVF\`; unwired, it is idle. An
\`X\` on \`RD\` or \`CLR\` may or may not have acted, so \`D\`, \`VLD\` and
\`BRK\` go \`X\` until the next \`CLR\`. \`RD\` counts only clean \`0\` to
\`1\` edges.

A reset empties the buffer but does not retype anything: keys typed before
the reset are gone.

## Typical uses

- A terminal: ASCII, handshake, \`RD\` driven by the CPU's read strobe, \`VLD\`
  as its "key ready" interrupt.
- Typing into a character display or a \`mem.ram\` text buffer, with strobe
  mode clocking a counter that addresses the next cell.
- Learning a real protocol: PS/2 with releases, decoded by a state machine that
  tracks \`E0\` and \`F0\` the way a keyboard controller does.

## On the canvas

1. Place it from the palette and wire \`D\` and \`VLD\` (and \`RD\` in handshake
   mode) into the circuit.
2. Click the face — or \`Tab\` to it and press \`Enter\` — and type. The face
   shows the last keys typed.
3. Press the exit key, or click elsewhere, to get the editor's shortcuts back.
4. Select the element to change the encoding, protocol and exit key.`,
  title: "Keyboard",
  shortTitle: "KBD",
  icon: "keypad",
  category: "io",
  pinLabels: "floating",
  keywords: [
    "keyboard",
    "typing",
    "ascii",
    "ps2",
    "scancode",
    "hid",
    "usb",
    "terminal",
    "uart",
    "fifo",
    "input",
  ],
  defaultParams: {
    encoding: "ascii",
    protocol: "handshake",
    depth: DEFAULT_DEPTH,
    pulseNs: DEFAULT_PULSE_NS,
    releases: false,
    repeat: true,
    exitKey: "escape",
    events: [],
  },
  view: "keyboard",
  paramsSchema: [
    {
      key: "encoding",
      label: "Encoding",
      kind: "select",
      options: [
        { value: "ascii", label: "ASCII" },
        { value: "hid", label: "USB HID usage" },
        { value: "ps2", label: "PS/2 scan code (Set 2)" },
      ],
    },
    {
      key: "protocol",
      label: "Protocol",
      kind: "select",
      options: [
        { value: "handshake", label: "Handshake (VLD / RD)" },
        { value: "strobe", label: "Strobe (VLD pulse)" },
      ],
    },
    {
      key: "depth",
      label: "Buffer depth",
      kind: "int",
      min: 1,
      max: MAX_DEPTH,
      hint: "Bytes held before OVF.",
    },
    {
      key: "pulseNs",
      label: "Strobe width (ns)",
      kind: "int",
      min: 1,
      max: MAX_PULSE_NS,
      hint: "Strobe protocol only.",
    },
    {
      key: "releases",
      label: "Report releases",
      kind: "bool",
      hint: "BRK pin for ASCII/HID, F0 prefix for PS/2.",
    },
    {
      key: "repeat",
      label: "Auto-repeat",
      kind: "bool",
      hint: "A held key keeps sending.",
    },
    {
      key: "exitKey",
      label: "Exit key",
      kind: "select",
      options: EXIT_CHORDS,
      hint: "Ends capture. That key is not sent.",
    },
  ],
  pins: (params) => {
    const { width, height } = bodySize(params);

    return [
      ...stack(
        [
          {
            id: "data",
            name: "D",
            direction: "out" as const,
            width: DATA_WIDTH,
          },
          { id: "valid", name: "VLD", direction: "out" as const, width: 1 },
          ...(hasBreakPin(params)
            ? [{ id: "brk", name: "BRK", direction: "out" as const, width: 1 }]
            : []),
          { id: "ovf", name: "OVF", direction: "out" as const, width: 1 },
        ],
        "right",
        height,
      ),
      {
        id: "clr",
        name: "CLR",
        direction: "in",
        width: 1,
        side: "top",
        offset: width / 2,
        // `controlState` reads an unwired CLR as idle — nothing is cleared.
        idleWhenFloating: true,
      },
      ...(protocolOf(params) === "handshake"
        ? [
            {
              id: "rd",
              name: "RD",
              direction: "in" as const,
              width: 1,
              side: "bottom" as const,
              offset: width / 2,
            },
          ]
        : []),
    ];
  },
  size: bodySize,
  createState: freshState,
  evaluate: (ctx) => {
    // A state that did not come from `createState` — a harness evaluating the
    // node cold — is filled in rather than read as if it had a buffer.
    if (!Array.isArray(ctx.state.fifo)) {
      Object.assign(ctx.state, freshState(ctx.params));
    }
    const state = ctx.state as KeyboardState;
    const protocol = protocolOf(ctx.params);
    const clear = controlState(ctx.read("clr")[0] as LogicValue);

    // Acknowledge before taking new keys in, so an `RD` edge removes the byte
    // the reader was actually shown, never one that arrived with the edge.
    if (protocol === "handshake") {
      const rd = ctx.read("rd")[0] as LogicValue;
      const edge = detectEdge(state.lastRd, rd, "rising");
      state.lastRd = rd;
      if (clear !== "asserted") {
        if (edge === "edge") state.fifo.shift();
        else if (edge === "unknown" && state.fifo.length > 0) {
          state.unknown = true;
        }
      }
    }

    const encoding = encodingOf(ctx.params.encoding);
    const releases = boolParam(ctx.params, "releases", false);
    const depth = boundedParam(
      ctx.params,
      "depth",
      DEFAULT_DEPTH,
      1,
      MAX_DEPTH,
    );
    const events = keyEvents(ctx.params);

    for (const event of events) {
      if (event.seq <= state.lastSeq) continue;
      for (const code of encodeKey(encoding, event, releases)) {
        if (state.fifo.length < depth) state.fifo.push(code);
        else state.overflow = true;
      }
    }
    // Never lowered: after an undo shortens the log, the next key the view
    // logs is numbered past everything it ever logged, so it still arrives,
    // while a redo of keys already consumed does not type them twice.
    state.lastSeq = Math.max(state.lastSeq, lastSeqOf(events));

    if (clear === "asserted") {
      state.fifo = [];
      state.overflow = false;
      state.unknown = false;
      state.phase = "idle";
      state.shown = null;
    } else if (clear === "unknown") {
      state.unknown = true;
    }

    let head: KeyCode | null;
    let valid: boolean;

    if (protocol === "strobe") {
      const pulseNs = boundedParam(
        ctx.params,
        "pulseNs",
        DEFAULT_PULSE_NS,
        1,
        MAX_PULSE_NS,
      );

      // Walk the pulse/gap machine up to now. Phases end at stored times, so
      // an evaluation that arrives for some other reason — a key, `CLR` —
      // neither stretches a pulse nor starts the next one early.
      for (;;) {
        if (state.phase === "high" && ctx.now >= state.phaseEnd) {
          state.fifo.shift();
          state.phase = "gap";
          state.phaseEnd += pulseNs;
        } else if (state.phase === "gap" && ctx.now >= state.phaseEnd) {
          state.phase = "idle";
        } else if (state.phase === "idle" && state.fifo.length > 0) {
          state.phase = "high";
          state.shown = state.fifo[0];
          state.phaseEnd = ctx.now + pulseNs;
        } else {
          break;
        }
      }

      if (state.phase !== "idle") ctx.scheduleSelf(state.phaseEnd - ctx.now);
      head = state.shown;
      valid = state.phase === "high";
    } else {
      head = state.fifo[0] ?? null;
      valid = state.fifo.length > 0;
    }

    const bit = (value: boolean) =>
      createSignal(1, state.unknown ? X : value ? HIGH : LOW);

    ctx.write(
      "data",
      state.unknown
        ? createSignal(DATA_WIDTH, X)
        : toBits(head?.byte ?? 0, DATA_WIDTH),
    );
    ctx.write("valid", bit(valid));
    if (hasBreakPin(ctx.params)) ctx.write("brk", bit(head?.brk ?? false));
    ctx.write("ovf", createSignal(1, state.overflow ? HIGH : LOW));
  },
});
