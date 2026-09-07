import { describe, expect, it } from "vitest";
import { createDocumentId, createNodeId, createWireId } from "./ids";

describe("id generation", () => {
  it("tags each kind with its cosmetic prefix", () => {
    expect(createDocumentId()).toMatch(/^d_[0-9A-Za-z_-]{12}$/);
    expect(createNodeId()).toMatch(/^n_[0-9A-Za-z_-]{12}$/);
    expect(createWireId()).toMatch(/^w_[0-9A-Za-z_-]{12}$/);
  });

  it("does not hand out the same id twice", () => {
    const ids = new Set(Array.from({ length: 10_000 }, createNodeId));
    expect(ids.size).toBe(10_000);
  });
});
