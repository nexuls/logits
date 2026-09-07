/**
 * Four-valued logic: the value type everything in the engine speaks.
 *
 * One byte per bit-lane, index 0 = LSB. Never a JS `number` bitmask — a
 * bitmask cannot express an unconnected input, an idle bus or two outputs
 * fighting, which are the situations this app exists to teach.
 * See artifacts/decisions/0002-four-valued-logic.md.
 */

export const LOW = 0;
export const HIGH = 1;
/** Unknown, or two drivers in conflict. */
export const X = 2;
/** High impedance: nothing is driving. */
export const Z = 3;

export type LogicValue = typeof LOW | typeof HIGH | typeof X | typeof Z;

/** A signal of width `w`, LSB first. */
export type Signal = Uint8Array;

const SYMBOLS = ["0", "1", "X", "Z"] as const;

/**
 * Tables are `Uint8Array(16)` indexed `a * 4 + b`, so a two-input op is one
 * array read. Folding a table pairwise is correct for the n-input gates
 * because each table already bakes in its controlling value — `and2(0, X)` is
 * `0`, so an AND with a `0` input is `0` however many unknowns join it, with
 * no special case in the fold.
 */
export type BitTable = Uint8Array;

const table = (rows: readonly (readonly LogicValue[])[]): BitTable =>
  Uint8Array.from(rows.flat());

/** Driver resolution — the table in artifacts/04-simulation-engine.md. */
export const RESOLVE: BitTable = table([
  //     0     1     X     Z
  /* 0 */ [LOW, X, X, LOW],
  /* 1 */ [X, HIGH, X, HIGH],
  /* X */ [X, X, X, X],
  /* Z */ [LOW, HIGH, X, Z],
]);

export const AND2: BitTable = table([
  [LOW, LOW, LOW, LOW],
  [LOW, HIGH, X, X],
  [LOW, X, X, X],
  [LOW, X, X, X],
]);

export const OR2: BitTable = table([
  [LOW, HIGH, X, X],
  [HIGH, HIGH, HIGH, HIGH],
  [X, HIGH, X, X],
  [X, HIGH, X, X],
]);

export const XOR2: BitTable = table([
  [LOW, HIGH, X, X],
  [HIGH, LOW, X, X],
  [X, X, X, X],
  [X, X, X, X],
]);

export function apply2(op: BitTable, a: LogicValue, b: LogicValue): LogicValue {
  return op[a * 4 + b] as LogicValue;
}

/** `Z` inverts to `X`: an undriven input is unknown, not a free `1`. */
export function not1(value: LogicValue): LogicValue {
  return value === LOW ? HIGH : value === HIGH ? LOW : X;
}

/** A gate input that is neither 0 nor 1 contributes nothing knowable. */
export function isKnownBit(value: LogicValue): boolean {
  return value === LOW || value === HIGH;
}

export function createSignal(width: number, fill: LogicValue = Z): Signal {
  return new Uint8Array(width).fill(fill);
}

export function bitAt(signal: Signal, index: number): LogicValue {
  // Out of range reads Z rather than throwing: a width mismatch is a
  // diagnostic, and the engine still has to produce a value for the net.
  return (index < signal.length ? signal[index] : Z) as LogicValue;
}

export function isKnown(signal: Signal): boolean {
  for (const bit of signal) {
    if (bit !== LOW && bit !== HIGH) return false;
  }
  return true;
}

export function signalsEqual(a: Signal, b: Signal): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Unsigned integer to a signal, LSB first. Bits above 32 read `LOW`. */
export function toBits(value: number, width: number): Signal {
  const out = createSignal(width, LOW);
  for (let i = 0; i < width; i++) {
    // `2 ** i` rather than `<<`, which wraps at 32 bits and would silently
    // alias bit 32 onto bit 0 for a wide bus.
    out[i] = Math.floor(Math.abs(value) / 2 ** i) % 2 === 1 ? HIGH : LOW;
  }
  return out;
}

/** Null unless every bit is 0 or 1 — `X` and `Z` have no numeric value. */
export function fromBits(signal: Signal): number | null {
  let total = 0;
  for (let i = 0; i < signal.length; i++) {
    if (!isKnownBit(signal[i] as LogicValue)) return null;
    if (signal[i] === HIGH) total += 2 ** i;
  }
  return total;
}

/** MSB first, the way a value is written down. `"01XZ"` reads as four bits. */
export function formatSignal(signal: Signal): string {
  let out = "";
  for (let i = signal.length - 1; i >= 0; i--) {
    out += SYMBOLS[signal[i] as LogicValue];
  }
  return out;
}

/** Inverse of `formatSignal`, for writing test fixtures by hand. */
export function parseSignal(text: string): Signal {
  const out = createSignal(text.length, X);
  for (let i = 0; i < text.length; i++) {
    const index = SYMBOLS.indexOf(
      text[text.length - 1 - i] as (typeof SYMBOLS)[number],
    );
    if (index < 0) throw new Error(`"${text[i]}" is not a logic value`);
    out[i] = index;
  }
  return out;
}

/**
 * Copies `value` into a signal of exactly `width`, padding with `Z`.
 *
 * The engine runs this over every write, so a node that returns the wrong
 * width writes a diagnosable `Z` rather than corrupting the net's buffer.
 */
export function fitSignal(value: Signal, width: number): Signal {
  if (value.length === width) return Uint8Array.from(value);
  const out = createSignal(width, Z);
  out.set(value.subarray(0, Math.min(value.length, width)));
  return out;
}

/** Combines drivers on a net, bit by bit, through the resolution table. */
export function resolveDrivers(
  drivers: readonly Signal[],
  width: number,
): Signal {
  const out = createSignal(width, Z);
  for (const driver of drivers) {
    for (let i = 0; i < width; i++) {
      out[i] = apply2(RESOLVE, out[i] as LogicValue, bitAt(driver, i));
    }
  }
  return out;
}

/**
 * Folds `inputs` bit-lane by bit-lane through `op`, optionally inverting.
 *
 * This is every symmetric gate in the catalog: AND is `AND2`, NAND is `AND2`
 * inverted. A single input folds to itself, so `gate.buffer` and `gate.not`
 * come out of the same function.
 */
export function combine(
  inputs: readonly Signal[],
  width: number,
  op: BitTable,
  invert = false,
): Signal {
  const out = createSignal(width, X);
  for (let i = 0; i < width; i++) {
    let bit = bitAt(inputs[0] ?? createSignal(width), i);
    for (let n = 1; n < inputs.length; n++) {
      bit = apply2(op, bit, bitAt(inputs[n], i));
    }
    // A lone Z input is unknown to a gate, so normalise it even with no fold.
    if (!isKnownBit(bit)) bit = X;
    out[i] = invert ? not1(bit) : bit;
  }
  return out;
}
