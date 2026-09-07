/**
 * Undo/redo as a pure value.
 *
 * Snapshots, not inverse patches: a document is plain JSON and the commands in
 * `src/lib/circuit/commands.ts` already return new documents with the
 * untouched parts shared by reference, so a snapshot costs one object per edit
 * rather than a deep copy. Patches would be smaller still — revisit that if a
 * real circuit ever makes this hurt, and measure first
 * (artifacts/02-architecture.md).
 *
 * Only *document* state belongs here. Simulation values, selection and the
 * viewport are not undoable; putting them in would make Ctrl+Z rewind time in
 * a running circuit.
 *
 * Generic over the snapshot type so it can be tested on its own, without
 * building a circuit to exercise the stack.
 */

export type History<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
  /** What produced `present` — the key consecutive edits coalesce on. */
  readonly label?: string;
};

/**
 * How many steps back the user can go. Snapshots are cheap but not free, and
 * an unbounded stack is a slow leak in a tab left open for a day.
 */
export const HISTORY_DEPTH = 100;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export type CommitOptions = {
  /** Names the edit, e.g. `"move"`. Required for coalescing to do anything. */
  label?: string;
  /**
   * Fold this edit into the previous one when the labels match. A drag emits
   * a move per pointer event; without this, undo would walk back through the
   * drag one frame at a time.
   */
  coalesce?: boolean;
};

export function commit<T>(
  history: History<T>,
  next: T,
  options: CommitOptions = {},
): History<T> {
  // Commands return their input unchanged when they no-op, so this is the one
  // place that has to notice, and nothing downstream records an empty step.
  if (next === history.present) return history;

  const { label, coalesce = false } = options;

  if (coalesce && label !== undefined && history.label === label) {
    return { ...history, present: next, future: [] };
  }

  const past = [...history.past, history.present];

  return {
    past: past.length > HISTORY_DEPTH ? past.slice(-HISTORY_DEPTH) : past,
    present: next,
    future: [],
    label,
  };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;

  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
}

export const canUndo = (history: History<unknown>) => history.past.length > 0;
export const canRedo = (history: History<unknown>) => history.future.length > 0;
