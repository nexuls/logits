import { describe, expect, it } from "vitest";
import { MAX_SEGMENTS, segmentMessage } from "./segment";

const texts = (message: string) =>
  segmentMessage(message).map((segment) => segment.text);

describe("segmentMessage", () => {
  it("cuts a list of things to do at commas and joining words", () => {
    expect(
      texts(
        "Place a 16x16 matrix display, a 16x16 draw pad, and connect the pins",
      ),
    ).toEqual([
      "Place a 16x16 matrix display",
      "a 16x16 draw pad",
      "connect the pins",
    ]);
  });

  it("never splits the name of an AND gate", () => {
    expect(texts("place an and gate")).toEqual(["place an and gate"]);
    expect(texts("add two and gates")).toEqual(["add two and gates"]);
    expect(texts("place an AND and an OR")).toEqual(["place an AND", "an OR"]);
    expect(texts("put a NAND AND gate here")).toEqual([
      "put a NAND AND gate here",
    ]);
  });

  it("splits 'and' between two named things, leaving the pieces for Jev to join", () => {
    expect(texts("connect the switch and the LED")).toEqual([
      "connect the switch",
      "the LED",
    ]);
  });

  it("does not cut inside quotes or a decimal", () => {
    expect(texts('add a note saying "red, then green" then run')).toEqual([
      'add a note saying "red, then green"',
      "run",
    ]);
    expect(texts("set it to 2.5")).toEqual(["set it to 2.5"]);
  });

  it("finds every number, with the words around it", () => {
    const [segment] = segmentMessage("Place a 16x16 matrix display");
    // One candidate per value, or a "16x16" splits Jev's answer between twins.
    expect(segment.numbers.map((mention) => mention.value)).toEqual([16]);
    expect(segment.numbers[0].context).toContain("16x16");

    const [words] = segmentMessage("add three 4-bit counters");
    expect(words.numbers.map((mention) => mention.value)).toEqual([3, 4]);
  });

  it("keeps quoted text for text settings, not as numbers", () => {
    const [segment] = segmentMessage('add a text saying "Stage 2"');
    expect(segment.quotes).toEqual(["Stage 2"]);
    expect(segment.numbers).toEqual([]);
  });

  it("flags a piece that names two elements", () => {
    const [pair, single] = segmentMessage(
      "connect the clock to the flip-flop; delete the LED",
    );
    expect(pair.pairs).toBe(true);
    expect(single.pairs).toBe(false);
  });

  it("folds a very long request into its last segment", () => {
    const message = Array.from({ length: 12 }, (_, k) => `add LED ${k}`).join(
      ", ",
    );
    expect(segmentMessage(message)).toHaveLength(MAX_SEGMENTS);
  });
});
