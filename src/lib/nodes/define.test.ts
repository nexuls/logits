import { describe, expect, it } from "vitest";
import { placeholderDefinition } from "./define";

describe("placeholderDefinition", () => {
  it("stands in for an unknown type without inventing pins", () => {
    const definition = placeholderDefinition("future.widget");

    expect(definition.type).toBe("future.widget");
    expect(definition.title).toBe("future.widget");
    expect(definition.category).toBe("unknown");
    expect(definition.pins({})).toEqual([]);
    expect(definition.defaultParams).toEqual({});
  });

  it("has a non-zero footprint so it is still selectable on the canvas", () => {
    const { width, height } = placeholderDefinition("x").size({});
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });
});
