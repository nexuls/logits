/**
 * Key-event encodings for `io.keyboard`: what a key on a PC keyboard puts on a
 * wire, in the three forms real hardware actually uses.
 *
 * Pure tables keyed by the W3C `KeyboardEvent.code` / `.key` *strings*, so the
 * view hands over plain data and nothing here touches the DOM. `code` names a
 * physical key regardless of layout, which is exactly what a scan code or a
 * HID usage is; `key` is the character the layout produced, which is what
 * ASCII is.
 */

/** One key transition, as the view records it into the node's params. */
export type KeyEvent = {
  /** Monotonic per node; how `evaluate` tells a new event from one it has seen. */
  seq: number;
  /** `KeyboardEvent.code` — the physical key. */
  code: string;
  /** `KeyboardEvent.key` — the character or named key the layout produced. */
  key: string;
  /** A release rather than a press. */
  up?: boolean;
  /** Control was held, which turns a letter into an ASCII control code. */
  ctrl?: boolean;
};

export type Encoding = "ascii" | "hid" | "ps2";

export function encodingOf(value: unknown): Encoding {
  return value === "hid" || value === "ps2" ? value : "ascii";
}

/** One byte for the FIFO, and whether it reports a release. */
export type KeyCode = { byte: number; brk: boolean };

/**
 * The bytes one key event produces, oldest first; empty for a key the encoding
 * has no code for (a dead key, `é` in ASCII, a media key).
 *
 * `releases` decides whether a release produces anything at all. ASCII and HID
 * flag it out of band, on `BRK`; PS/2 carries it in band as the `F0` prefix,
 * which is why that is the one encoding where an event can be three bytes.
 */
export function encodeKey(
  encoding: Encoding,
  event: KeyEvent,
  releases: boolean,
): KeyCode[] {
  if (event.up && !releases) return [];
  const brk = event.up === true;

  if (encoding === "hid") {
    const usage = HID_USAGE[event.code];
    return usage === undefined ? [] : [{ byte: usage, brk }];
  }

  if (encoding === "ps2") {
    const make = PS2_SET2[event.code];
    if (make === undefined) return [];
    const extended = make > 0xff;
    const bytes = [
      ...(extended ? [0xe0] : []),
      ...(brk ? [0xf0] : []),
      make & 0xff,
    ];
    return bytes.map((byte) => ({ byte, brk }));
  }

  const ascii = asciiOf(event);
  return ascii === undefined ? [] : [{ byte: ascii, brk }];
}

/**
 * The 7-bit ASCII a terminal keyboard sends for a key. Enter is CR, as a
 * terminal sends it, not LF; Ctrl with a letter or one of `@[\]^_` is the C0
 * control code, so Ctrl+C is `0x03` the way it has been since the Teletype.
 */
function asciiOf({ key, ctrl }: KeyEvent): number | undefined {
  const named = ASCII_NAMED[key];
  if (named !== undefined) return named;
  if (key.length !== 1) return undefined;

  const char = key.charCodeAt(0);
  if (char > 0x7e || char < 0x20) return undefined;
  if (!ctrl) return char;

  const upper = key.toUpperCase().charCodeAt(0);
  return upper >= 0x40 && upper <= 0x5f ? upper & 0x1f : char;
}

const ASCII_NAMED: Record<string, number> = {
  Enter: 0x0d,
  Backspace: 0x08,
  Tab: 0x09,
  Escape: 0x1b,
  Delete: 0x7f,
};

/** USB HID Usage Tables, Keyboard/Keypad page (0x07). */
const HID_USAGE: Record<string, number> = {
  ...letters((index) => 0x04 + index),
  Digit1: 0x1e,
  Digit2: 0x1f,
  Digit3: 0x20,
  Digit4: 0x21,
  Digit5: 0x22,
  Digit6: 0x23,
  Digit7: 0x24,
  Digit8: 0x25,
  Digit9: 0x26,
  Digit0: 0x27,
  Enter: 0x28,
  Escape: 0x29,
  Backspace: 0x2a,
  Tab: 0x2b,
  Space: 0x2c,
  Minus: 0x2d,
  Equal: 0x2e,
  BracketLeft: 0x2f,
  BracketRight: 0x30,
  Backslash: 0x31,
  IntlHash: 0x32,
  Semicolon: 0x33,
  Quote: 0x34,
  Backquote: 0x35,
  Comma: 0x36,
  Period: 0x37,
  Slash: 0x38,
  CapsLock: 0x39,
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [`F${index + 1}`, 0x3a + index]),
  ),
  PrintScreen: 0x46,
  ScrollLock: 0x47,
  Pause: 0x48,
  Insert: 0x49,
  Home: 0x4a,
  PageUp: 0x4b,
  Delete: 0x4c,
  End: 0x4d,
  PageDown: 0x4e,
  ArrowRight: 0x4f,
  ArrowLeft: 0x50,
  ArrowDown: 0x51,
  ArrowUp: 0x52,
  NumLock: 0x53,
  NumpadDivide: 0x54,
  NumpadMultiply: 0x55,
  NumpadSubtract: 0x56,
  NumpadAdd: 0x57,
  NumpadEnter: 0x58,
  Numpad1: 0x59,
  Numpad2: 0x5a,
  Numpad3: 0x5b,
  Numpad4: 0x5c,
  Numpad5: 0x5d,
  Numpad6: 0x5e,
  Numpad7: 0x5f,
  Numpad8: 0x60,
  Numpad9: 0x61,
  Numpad0: 0x62,
  NumpadDecimal: 0x63,
  IntlBackslash: 0x64,
  ContextMenu: 0x65,
  ControlLeft: 0xe0,
  ShiftLeft: 0xe1,
  AltLeft: 0xe2,
  MetaLeft: 0xe3,
  ControlRight: 0xe4,
  ShiftRight: 0xe5,
  AltRight: 0xe6,
  MetaRight: 0xe7,
};

/**
 * PS/2 Scan Code Set 2 make codes. A value above `0xff` is an extended key:
 * its low byte follows an `E0` prefix. Print Screen and Pause are left out on
 * purpose — their multi-byte sequences are not "prefix plus code" and no
 * decoder a student writes should have to special-case them.
 */
const PS2_SET2: Record<string, number> = {
  KeyA: 0x1c,
  KeyB: 0x32,
  KeyC: 0x21,
  KeyD: 0x23,
  KeyE: 0x24,
  KeyF: 0x2b,
  KeyG: 0x34,
  KeyH: 0x33,
  KeyI: 0x43,
  KeyJ: 0x3b,
  KeyK: 0x42,
  KeyL: 0x4b,
  KeyM: 0x3a,
  KeyN: 0x31,
  KeyO: 0x44,
  KeyP: 0x4d,
  KeyQ: 0x15,
  KeyR: 0x2d,
  KeyS: 0x1b,
  KeyT: 0x2c,
  KeyU: 0x3c,
  KeyV: 0x2a,
  KeyW: 0x1d,
  KeyX: 0x22,
  KeyY: 0x35,
  KeyZ: 0x1a,
  Digit0: 0x45,
  Digit1: 0x16,
  Digit2: 0x1e,
  Digit3: 0x26,
  Digit4: 0x25,
  Digit5: 0x2e,
  Digit6: 0x36,
  Digit7: 0x3d,
  Digit8: 0x3e,
  Digit9: 0x46,
  Backquote: 0x0e,
  Minus: 0x4e,
  Equal: 0x55,
  Backslash: 0x5d,
  Backspace: 0x66,
  Space: 0x29,
  Tab: 0x0d,
  CapsLock: 0x58,
  ShiftLeft: 0x12,
  ControlLeft: 0x14,
  AltLeft: 0x11,
  MetaLeft: 0x11f,
  ShiftRight: 0x59,
  ControlRight: 0x114,
  AltRight: 0x111,
  MetaRight: 0x127,
  ContextMenu: 0x12f,
  Enter: 0x5a,
  Escape: 0x76,
  F1: 0x05,
  F2: 0x06,
  F3: 0x04,
  F4: 0x0c,
  F5: 0x03,
  F6: 0x0b,
  F7: 0x83,
  F8: 0x0a,
  F9: 0x01,
  F10: 0x09,
  F11: 0x78,
  F12: 0x07,
  ScrollLock: 0x7e,
  BracketLeft: 0x54,
  BracketRight: 0x5b,
  Semicolon: 0x4c,
  Quote: 0x52,
  Comma: 0x41,
  Period: 0x49,
  Slash: 0x4a,
  IntlBackslash: 0x61,
  Insert: 0x170,
  Home: 0x16c,
  PageUp: 0x17d,
  Delete: 0x171,
  End: 0x169,
  PageDown: 0x17a,
  ArrowUp: 0x175,
  ArrowLeft: 0x16b,
  ArrowDown: 0x172,
  ArrowRight: 0x174,
  NumLock: 0x77,
  NumpadDivide: 0x14a,
  NumpadMultiply: 0x7c,
  NumpadSubtract: 0x7b,
  NumpadAdd: 0x79,
  NumpadEnter: 0x15a,
  NumpadDecimal: 0x71,
  Numpad0: 0x70,
  Numpad1: 0x69,
  Numpad2: 0x72,
  Numpad3: 0x7a,
  Numpad4: 0x6b,
  Numpad5: 0x73,
  Numpad6: 0x74,
  Numpad7: 0x6c,
  Numpad8: 0x75,
  Numpad9: 0x7d,
};

function letters(value: (index: number) => number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: 26 }, (_, index) => [
      `Key${String.fromCharCode(65 + index)}`,
      value(index),
    ]),
  );
}

/** The chord that ends capture and hands the keyboard back to the editor. */
export type ExitChord = "escape" | "shift-escape" | "ctrl-bracket";

export const EXIT_CHORDS: readonly { value: ExitChord; label: string }[] = [
  { value: "escape", label: "Esc" },
  { value: "shift-escape", label: "Shift+Esc" },
  { value: "ctrl-bracket", label: "Ctrl+]" },
];

export function exitChordOf(value: unknown): ExitChord {
  return EXIT_CHORDS.find((chord) => chord.value === value)?.value ?? "escape";
}

export function exitChordLabel(chord: ExitChord): string {
  return EXIT_CHORDS.find((entry) => entry.value === chord)?.label ?? "Esc";
}

/**
 * Whether a key-down is the exit chord. Matched on `code` for `]` so the chord
 * is the same physical key on every layout — on a German board `]` is AltGr+9,
 * and an exit that moved with the layout would be one nobody could find.
 */
export function isExitChord(
  chord: ExitChord,
  event: {
    code: string;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  },
): boolean {
  switch (chord) {
    case "shift-escape":
      return event.code === "Escape" && event.shiftKey;
    case "ctrl-bracket":
      return (event.ctrlKey || event.metaKey) && event.code === "BracketRight";
    default:
      return (
        event.code === "Escape" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey
      );
  }
}
