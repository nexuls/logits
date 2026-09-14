import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_SCALE, MIN_SCALE } from "@/lib/circuit/coords";
import { createEmptyDocument } from "@/lib/circuit/io";
import {
  readViewport,
  removeDocument,
  removeViewport,
  viewKey,
  writeDocument,
  writeViewport,
} from "./storage";

/**
 * The remembered view, against a stubbed browser — same stub as
 * `document-autosave.test.ts`, for the same reason.
 */

let store: Map<string, string>;

beforeEach(() => {
  store = new Map();

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("viewport persistence", () => {
  it("round-trips a view", () => {
    const view = { scale: 2.5, offset: { x: -120, y: 64 } };
    expect(writeViewport("doc-1", view)).toEqual({ ok: true });
    expect(readViewport("doc-1")).toEqual(view);
  });

  it("keeps one view per project", () => {
    writeViewport("doc-1", { scale: 2, offset: { x: 1, y: 1 } });
    writeViewport("doc-2", { scale: 0.5, offset: { x: 9, y: 9 } });

    expect(readViewport("doc-1")?.scale).toBe(2);
    expect(readViewport("doc-2")?.scale).toBe(0.5);
  });

  it("returns null when nothing is stored", () => {
    expect(readViewport("missing")).toBeNull();
  });

  it("returns null rather than throwing on a corrupt entry", () => {
    store.set(viewKey("doc-1"), "{not json");
    expect(readViewport("doc-1")).toBeNull();

    store.set(viewKey("doc-2"), JSON.stringify({ scale: "big" }));
    expect(readViewport("doc-2")).toBeNull();
  });

  it("clamps a scale outside this build's limits", () => {
    writeViewport("doc-1", { scale: 1000, offset: { x: 0, y: 0 } });
    expect(readViewport("doc-1")?.scale).toBe(MAX_SCALE);

    writeViewport("doc-2", { scale: 0.0001, offset: { x: 0, y: 0 } });
    expect(readViewport("doc-2")?.scale).toBe(MIN_SCALE);
  });

  it("drops the view when its project is deleted", () => {
    const document = createEmptyDocument("Doomed");
    writeDocument(document);
    writeViewport(document.id, { scale: 2, offset: { x: 4, y: 4 } });

    removeDocument(document.id);

    expect(readViewport(document.id)).toBeNull();
  });

  it("removes without complaint when there is nothing to remove", () => {
    expect(removeViewport("missing")).toEqual({ ok: true });
  });
});
