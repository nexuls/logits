import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  HISTORY_DEPTH,
  redo,
  undo,
} from "./history";

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = createHistory("a");

    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("walks back and forward through committed states", () => {
    const history = commit(commit(createHistory("a"), "b"), "c");

    const back = undo(undo(history));
    expect(back.present).toBe("a");
    expect(canRedo(back)).toBe(true);

    expect(redo(back).present).toBe("b");
    expect(redo(redo(back)).present).toBe("c");
  });

  it("ignores a commit that did not change anything", () => {
    const history = commit(createHistory("a"), "b");
    expect(commit(history, "b")).toBe(history);
    expect(commit(history, history.present)).toBe(history);
  });

  it("drops the redo stack once a new edit lands", () => {
    const history = undo(commit(commit(createHistory("a"), "b"), "c"));
    expect(canRedo(history)).toBe(true);

    const diverged = commit(history, "d");
    expect(canRedo(diverged)).toBe(false);
    expect(undo(diverged).present).toBe("b");
  });

  it("folds consecutive edits that share a label", () => {
    const start = commit(createHistory("a"), "b", { label: "move" });
    const dragged = commit(start, "c", { label: "move", coalesce: true });
    const settled = commit(dragged, "d", { label: "move", coalesce: true });

    expect(settled.present).toBe("d");
    // The whole drag undoes in one step, back to before it began.
    expect(undo(settled).present).toBe("a");
  });

  it("does not fold across different labels, or without the flag", () => {
    const moved = commit(createHistory("a"), "b", { label: "move" });
    const rotated = commit(moved, "c", { label: "rotate", coalesce: true });
    expect(undo(rotated).present).toBe("b");

    const again = commit(moved, "c", { label: "move" });
    expect(undo(again).present).toBe("b");
  });

  it("caps the stack, dropping the oldest states", () => {
    let history = createHistory(0);
    for (let step = 1; step <= HISTORY_DEPTH + 10; step++) {
      history = commit(history, step);
    }

    // 111 states existed (0…110); the oldest 11 fell off the back.
    expect(history.past).toHaveLength(HISTORY_DEPTH);
    expect(history.past[0]).toBe(10);
    expect(history.past.at(-1)).toBe(HISTORY_DEPTH + 9);
  });

  it("undoing at the start and redoing at the end change nothing", () => {
    const history = createHistory("a");
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});
