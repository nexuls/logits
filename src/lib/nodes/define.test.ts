import { describe, expect, it } from "vitest";
import { colorParam, placeholderDefinition } from "./define";

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

describe("colorParam", () => {
  const withColors = {
    ...placeholderDefinition("io.demo"),
    paramsSchema: [
      {
        key: "color",
        label: "Colour",
        kind: "color",
        options: [
          { value: "green", label: "Green", swatch: "var(--a)" },
          { value: "red", label: "Red", swatch: "var(--b)" },
        ],
      },
    ],
  } as const;

  it("resolves the selected option's swatch", () => {
    expect(colorParam(withColors, { color: "red" })).toBe("var(--b)");
  });

  it("falls back to the first option for a value no longer in the list", () => {
    // A save file can name a colour this build dropped; the node still draws.
    expect(colorParam(withColors, { color: "ultraviolet" })).toBe("var(--a)");
    expect(colorParam(withColors, {})).toBe("var(--a)");
  });

  it("is undefined for a definition with no colour param", () => {
    expect(colorParam(placeholderDefinition("x"), {})).toBeUndefined();
  });
});
