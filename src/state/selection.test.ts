import { beforeEach, describe, expect, it } from "vitest";

import {
  addToSelection,
  clearSelection,
  getSelection,
  isSelected,
  pruneSelection,
  resetSelection,
  selectOnly,
  toggleInSelection,
} from "./selection";

beforeEach(() => {
  resetSelection();
});

describe("selectOnly", () => {
  it("replaces both halves of the selection", () => {
    selectOnly(["a", "b"], ["w1"]);
    selectOnly(["c"]);

    expect(getSelection()).toEqual({ nodeIds: ["c"], wireIds: [] });
  });

  it("sorts and deduplicates so equal selections compare equal", () => {
    selectOnly(["b", "a", "a"]);
    expect(getSelection().nodeIds).toEqual(["a", "b"]);
  });

  it("keeps the same snapshot object when nothing changed", () => {
    selectOnly(["a", "b"]);
    const first = getSelection();

    selectOnly(["b", "a"]);
    // A pointer-move handler re-selects the same elements many times a second;
    // a new object each time would re-render the whole node layer.
    expect(getSelection()).toBe(first);
  });
});

describe("toggleInSelection", () => {
  it("adds then removes, leaving the other half alone", () => {
    selectOnly(["a"], ["w1"]);

    toggleInSelection("node", "b");
    expect(getSelection().nodeIds).toEqual(["a", "b"]);
    expect(getSelection().wireIds).toEqual(["w1"]);

    toggleInSelection("node", "b");
    expect(getSelection().nodeIds).toEqual(["a"]);
  });
});

describe("addToSelection", () => {
  it("unions with what is already selected", () => {
    selectOnly(["a"]);
    addToSelection(["a", "b"], ["w1"]);

    expect(getSelection()).toEqual({ nodeIds: ["a", "b"], wireIds: ["w1"] });
  });
});

describe("pruneSelection", () => {
  it("drops ids the document no longer has", () => {
    selectOnly(["a", "b"], ["w1", "w2"]);
    pruneSelection(
      (id) => id === "a",
      (id) => id === "w2",
    );

    expect(getSelection()).toEqual({ nodeIds: ["a"], wireIds: ["w2"] });
  });
});

describe("clearSelection", () => {
  it("empties both halves", () => {
    selectOnly(["a"], ["w1"]);
    clearSelection();

    expect(isSelected("node", "a")).toBe(false);
    expect(getSelection()).toEqual({ nodeIds: [], wireIds: [] });
  });
});
