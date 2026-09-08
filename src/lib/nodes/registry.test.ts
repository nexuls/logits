import { describe, expect, it } from "vitest";
import { lookupNode, nodeCategories, nodeDefinitions } from "./registry";

const categoryIds = new Set(nodeCategories.map((category) => category.id));

describe("registry", () => {
  it("has no duplicate types, and every type is `family.name`", () => {
    const types = nodeDefinitions.map((definition) => definition.type);

    expect(new Set(types).size).toBe(types.length);
    for (const type of types) {
      expect(type).toMatch(/^[a-z]+\.[a-z0-9]+$/);
    }
  });

  it("looks a definition up by type and returns undefined otherwise", () => {
    expect(lookupNode("gate.and")?.title).toBe("AND");
    expect(lookupNode("gate.nonexistent")).toBeUndefined();
  });

  it("puts every definition in a known category", () => {
    for (const definition of nodeDefinitions) {
      expect(categoryIds.has(definition.category)).toBe(true);
    }
  });

  describe.each(
    nodeDefinitions.map((definition) => [definition.type, definition] as const),
  )("%s", (_type, definition) => {
    const pins = definition.pins(definition.defaultParams);
    const size = definition.size(definition.defaultParams);

    it("has a footprint that leaves room for every pin", () => {
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);

      for (const pin of pins) {
        const along =
          pin.side === "left" || pin.side === "right"
            ? size.height
            : size.width;
        expect(pin.offset).toBeGreaterThanOrEqual(0);
        expect(pin.offset).toBeLessThanOrEqual(along);
      }
    });

    it("has unique pin ids and at least one pin", () => {
      const ids = pins.map((pin) => pin.id);

      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    });

    // The palette's info dialog is driven straight off `docs`, so a node
    // shipped without one has no help at all. Checked here rather than left
    // to review, since the dialog degrades quietly instead of failing.
    it("documents itself", () => {
      expect(definition.docs?.trim().length ?? 0).toBeGreaterThan(200);
    });

    it("has balanced code spans in its docs", () => {
      // An odd count means a `\`` escape was lost somewhere in a template
      // literal, which renders as a run of literal backticks rather than as
      // code and is invisible until someone opens the dialog.
      const backticks = definition.docs?.match(/`/g)?.length ?? 0;
      expect(backticks % 2).toBe(0);
    });
  });
});

describe("parameterised pins", () => {
  it("grows a symmetric gate's inputs and body together", () => {
    const and = lookupNode("gate.and");
    if (!and) throw new Error("gate.and is missing from the registry");

    const pins = and.pins({ inputs: 8, width: 1 });
    const size = and.size({ inputs: 8, width: 1 });

    expect(pins.filter((pin) => pin.direction === "in")).toHaveLength(8);
    expect(size.height).toBeGreaterThanOrEqual(16);
    for (const pin of pins) {
      expect(pin.offset).toBeLessThanOrEqual(size.height);
    }
  });

  it("clamps a bad `inputs` param instead of producing NaN pins", () => {
    const or = lookupNode("gate.or");
    if (!or) throw new Error("gate.or is missing from the registry");

    expect(or.pins({ inputs: 99 })).toHaveLength(9);
    expect(or.pins({ inputs: "many" })).toHaveLength(3);
    expect(or.pins({}).every((pin) => Number.isFinite(pin.offset))).toBe(true);
  });

  it("keeps a tri-state enable one bit wide at any data width", () => {
    const tristate = lookupNode("gate.tristate");
    const enable = tristate?.pins({ width: 8 }).find((pin) => pin.id === "en");

    expect(enable?.width).toBe(1);
  });
});
