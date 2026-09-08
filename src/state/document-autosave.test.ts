import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { examples } from "@/example";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  flushSave,
  getDocument,
  getSaveState,
  isEphemeral,
  openDocument,
  placeNode,
  resetDocumentStore,
  setDocument,
} from "./document";
import { documentKey } from "./storage";

/**
 * Autosave, against a stubbed browser.
 *
 * `storage.ts` reaches for `window.localStorage` and the store registers a
 * `beforeunload` flush, so the node test environment needs both — which is
 * also the cheapest way to prove the write path really runs, rather than
 * falling back to the no-op it uses when storage is unavailable.
 */

const definition = lookupNode("gate.and") as NodeDefinition;

let store: Map<string, string>;
let failWrites: string | null;

beforeEach(() => {
  store = new Map();
  failWrites = null;

  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error(failWrites);
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key),
  };

  vi.stubGlobal("window", {
    localStorage,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });

  vi.useFakeTimers();
  resetDocumentStore();
});

afterEach(() => {
  resetDocumentStore();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function storedNodeCount(id: string) {
  const raw = store.get(documentKey(id));
  if (!raw) return null;
  return Object.keys(JSON.parse(raw).nodes).length;
}

describe("autosave", () => {
  it("writes the document once the debounce elapses", () => {
    const document = createEmptyDocument("Autosaved");
    setDocument(document);
    placeNode(definition, { x: 0, y: 0 });

    // Still only pending — an edit must not hit storage on every keystroke.
    expect(storedNodeCount(document.id)).toBeNull();
    expect(getSaveState().pending).toBe(true);

    vi.runAllTimers();

    expect(storedNodeCount(document.id)).toBe(1);
    expect(getSaveState()).toEqual({ pending: false, error: null });
  });

  it("coalesces a burst of edits into one write", () => {
    const document = createEmptyDocument("Busy");
    setDocument(document);

    const writes = vi.spyOn(window.localStorage, "setItem");
    for (let i = 0; i < 5; i++) placeNode(definition, { x: i * 100, y: 0 });
    vi.runAllTimers();

    // One document write plus the project index the write rebuilds.
    expect(
      writes.mock.calls.filter(([key]) => key.startsWith("logits:doc:")),
    ).toHaveLength(1);
    expect(storedNodeCount(document.id)).toBe(5);
  });

  it("flushes pending work when the document is swapped out", () => {
    const first = createEmptyDocument("First");
    setDocument(first);
    placeNode(definition, { x: 0, y: 0 });

    setDocument(createEmptyDocument("Second"));

    expect(storedNodeCount(first.id)).toBe(1);
  });

  it("reports a refused write instead of losing it silently", () => {
    const document = createEmptyDocument("Full");
    setDocument(document);
    placeNode(definition, { x: 0, y: 0 });

    failWrites = "QuotaExceededError";
    vi.runAllTimers();

    expect(getSaveState().pending).toBe(false);
    expect(getSaveState().error).toContain("QuotaExceeded");
  });

  it("does nothing when there is no pending edit", () => {
    const writes = vi.spyOn(window.localStorage, "setItem");
    flushSave();

    expect(writes).not.toHaveBeenCalled();
  });
});

/**
 * The examples are the one thing that is editable without being saved, so the
 * gate on that has to be tested where autosave is tested — a regression here
 * would silently start writing shipped circuits into the user's project list.
 */
describe("example documents", () => {
  const example = examples[0];

  it("opens an example that is in no storage", () => {
    expect(openDocument(example.id)).toBe(true);
    expect(getDocument()?.name).toBe(example.name);
    expect(isEphemeral()).toBe(true);
  });

  it("never writes an example, however much it is edited", () => {
    openDocument(example.id);

    placeNode(definition, { x: 0, y: 0 });
    vi.runAllTimers();
    flushSave();

    expect(store.size).toBe(0);
    // Nothing is pending either: a save indicator must not spin forever on a
    // write that is never going to happen.
    expect(getSaveState()).toEqual({ pending: false, error: null });
  });

  it("leaves the catalogue copy pristine when an example is edited", () => {
    const before = Object.keys(example.document.nodes).length;

    openDocument(example.id);
    placeNode(definition, { x: 0, y: 0 });

    expect(Object.keys(getDocument()?.nodes ?? {})).toHaveLength(before + 1);
    // Reopening it is what a user does after switching away, and they must get
    // the shipped circuit back rather than a mutated module-level object.
    expect(Object.keys(example.document.nodes)).toHaveLength(before);
  });

  it("clears the flag when a real project is opened next", () => {
    openDocument(example.id);
    expect(isEphemeral()).toBe(true);

    const project = createEmptyDocument("Real");
    setDocument(project);
    placeNode(definition, { x: 0, y: 0 });
    vi.runAllTimers();

    expect(isEphemeral()).toBe(false);
    expect(storedNodeCount(project.id)).toBe(1);
  });

  it("prefers a stored project over an example with the same id", () => {
    store.set(
      documentKey(example.id),
      JSON.stringify({
        version: 2,
        id: example.id,
        name: "Mine",
        nodes: {},
        wires: {},
      }),
    );

    expect(openDocument(example.id)).toBe(true);
    expect(getDocument()?.name).toBe("Mine");
    expect(isEphemeral()).toBe(false);
  });

  it("returns false for an id that is neither", () => {
    expect(openDocument("d_nothing")).toBe(false);
  });
});
