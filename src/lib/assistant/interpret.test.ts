import { describe, expect, it } from "vitest";
import { lookupNode, nodeDefinitions } from "@/lib/nodes/registry";
import { interpret } from "./interpret";
import type { Answers, Ask, ChoiceQuestion, Questions } from "./jev";
import type { AssistantRequest, ContextNode } from "./protocol";

/**
 * A scripted Jev. Each rule picks an option for the questions whose id it
 * matches; anything unscripted gets the "nothing to say" option a real model
 * would pick for a segment it does not apply to. Every question asked is
 * recorded, so a test can check what was — and was not — asked.
 */
type Pick = string | ((question: ChoiceQuestion) => string);

function scripted(
  rules: Record<string, Pick>,
  confidence: Record<string, number> = {},
): Ask & { asked: Questions[] } {
  const asked: Questions[] = [];
  const ask = async (_state: unknown, questions: Questions) => {
    asked.push(questions);
    const answers: Answers = {};
    for (const [id, question] of Object.entries(questions)) {
      const rule = rules[id];
      const keys = Object.keys(question.criteria);
      const choice =
        typeof rule === "function"
          ? rule(question)
          : (rule ??
            ["unspecified", "none", "auto", "one", "other"].find((key) =>
              keys.includes(key),
            ) ??
            keys[0]);
      if (!keys.includes(choice)) {
        throw new Error(`"${choice}" is not an option of ${id}`);
      }
      const top = confidence[id] ?? 0.9;
      const rest = keys.filter((key) => key !== choice);
      answers[id] = {
        choice,
        confidence: top,
        probabilities: Object.fromEntries([
          [choice, top],
          ...rest.map((key, k) => [key, k === 0 ? 1 - top : 0]),
        ]),
      };
    }
    return answers;
  };
  return Object.assign(ask, { asked });
}

/** The option whose description begins with an element's title. */
const element =
  (title: string): Pick =>
  (question) => {
    const found = Object.entries(question.criteria).find(([, text]) =>
      text.startsWith(`${title}.`),
    );
    if (!found) throw new Error(`no element "${title}"`);
    return found[0];
  };

/** The option for the n-th number mention. */
const number = (k: number): Pick => `n${k}`;

function request(message: string, nodes: ContextNode[] = []): AssistantRequest {
  return { message, nodes, chips: [] };
}

const deps = (ask: Ask) => ({
  ask,
  definitions: nodeDefinitions,
  lookup: lookupNode,
});

describe("interpret", () => {
  it("reads 'place a matrix, a draw pad, and connect the pins' as two places and a wire", async () => {
    const ask = scripted({
      kind_0: "place",
      element_0: element("Matrix display"),
      count_0: "one",
      kind_1: "continuation",
      element_1: element("Draw pad"),
      count_1: "one",
      kind_2: "connect",
      refers_2: "placed",
      param_0_size: number(0),
      param_1_columns: number(0),
      param_1_rows: number(0),
    });

    const result = await interpret(
      request(
        "Place a 16x16 matrix display, a 16x16 draw pad, and connect the pins",
      ),
      deps(ask),
    );

    expect(result.unsure).toEqual([]);
    expect(result.plan).toEqual([
      { op: "place", type: "disp.matrix", count: 1, params: { size: 16 } },
      {
        op: "place",
        type: "io.drawpad",
        count: 1,
        params: { columns: 16, rows: 16 },
      },
      {
        op: "connect",
        from: { kind: "placed", step: 0 },
        to: { kind: "placed", step: 1 },
      },
    ]);
    // Two round trips: the reading, then the settings of what it names.
    expect(ask.asked).toHaveLength(2);
  });

  it("wires everything a message added when told only to 'connect them'", async () => {
    const ask = scripted({
      kind_0: "place",
      element_0: element("Switch"),
      count_0: number(0),
      kind_1: "place",
      element_1: element("AND"),
      kind_2: "place",
      element_2: element("LED"),
      kind_3: "connect",
      refers_3: "placed",
    });

    const result = await interpret(
      request("add two switches, an AND gate and an LED, then connect them"),
      deps(ask),
    );

    expect(result.plan.filter((step) => step.op === "connect")).toEqual([
      {
        op: "connect",
        from: { kind: "placed", step: 0 },
        to: { kind: "placed", step: 1 },
      },
      {
        op: "connect",
        from: { kind: "placed", step: 1 },
        to: { kind: "placed", step: 2 },
      },
    ]);
  });

  it("reads 'each pin of the pad into a split, then the matrices' as one bridged wiring", async () => {
    const ask = scripted({
      via: "via_split",
      kind_0: "place",
      element_0: element("Matrix display"),
      count_0: number(0),
      param_0_size: number(1),
      kind_1: "continuation",
      element_1: element("Draw pad"),
      count_1: number(0),
      param_1_columns: number(1),
      param_1_rows: number(1),
      kind_2: "connect",
      element_2: element("Split"),
      refers_2: "placed",
      element2_2: element("Split"),
      kind_3: "connect",
      refers_3: "placed",
      count_3: "one",
      kind_4: "continuation",
      refers_4: "placed",
    });

    const result = await interpret(
      request(
        "Place 4 16x16 matrix display, 1 32x32 draw pad. Take wire from each pin of the draw pad into a split node and connect the two matrix display accordingly. Do this for all the pins.",
      ),
      deps(ask),
    );

    expect(result.unsure).toEqual([]);
    expect(result.plan).toEqual([
      { op: "place", type: "disp.matrix", count: 4, params: { size: 16 } },
      {
        op: "place",
        type: "io.drawpad",
        count: 1,
        params: { columns: 32, rows: 32 },
      },
      {
        op: "connect",
        from: { kind: "placed", step: 0 },
        to: { kind: "placed", step: 1 },
        via: "bus.split",
      },
    ]);
  });

  it("does not ask back over a doubt that changes nothing", async () => {
    // Torn between "continuation" and "connect" right after a connect: both
    // mean the same wiring, so neither is worth a question.
    const ask: Ask = async (state, questions) => {
      const answers = await scripted({
        kind_0: "place",
        element_0: element("Switch"),
        kind_1: "place",
        element_1: element("LED"),
        kind_2: "connect",
        refers_2: "placed",
        kind_3: "continuation",
        refers_3: "placed",
      })(state, questions);
      if (answers.kind_3) {
        answers.kind_3 = {
          choice: "continuation",
          confidence: 0.3,
          probabilities: { continuation: 0.45, connect: 0.42, other: 0.13 },
        };
      }
      return answers;
    };

    const result = await interpret(
      request("add a switch, an LED, connect them, for every pin"),
      deps(ask),
    );

    expect(result.unsure).toEqual([]);
    expect(result.plan.filter((step) => step.op === "connect")).toHaveLength(1);
  });

  it("asks back instead of acting when the element is a toss-up", async () => {
    const ask = scripted(
      { kind_0: "place", element_0: element("Hex display") },
      { element_0: 0.2 },
    );

    const result = await interpret(request("add a big display"), deps(ask));

    expect(result.plan).toEqual([]);
    expect(result.unsure).toHaveLength(1);
    expect(result.unsure[0]).toContain("Hex display");
    // Nothing is worth a second request once the answer is "ask the user".
    expect(ask.asked).toHaveLength(1);
  });

  it("carries a request out whole or not at all", async () => {
    const ask = scripted(
      {
        kind_0: "place",
        element_0: element("LED"),
        kind_1: "delete",
      },
      { kind_1: 0.2 },
    );

    const result = await interpret(
      request("add an LED, then zap it"),
      deps(ask),
    );

    expect(result.plan).toEqual([]);
    expect(result.unsure).toHaveLength(1);
  });

  it("maps run controls and undo without touching the canvas", async () => {
    const ask = scripted({ kind_0: "play", kind_1: "undo" });

    const result = await interpret(request("start it, then undo"), deps(ask));

    expect(result.plan).toEqual([
      { op: "run", action: "play" },
      { op: "history", action: "undo" },
    ]);
    expect(ask.asked).toHaveLength(1);
  });

  it("changes the selected element's setting from the number in the request", async () => {
    const ask = scripted({
      kind_0: "set",
      refers_0: "selection",
      param_0_width: number(0),
    });

    const result = await interpret(
      request("make it 8 bits wide", [
        { id: "n_counter", type: "seq.counter", selected: true },
      ]),
      deps(ask),
    );

    expect(result.plan).toEqual([
      {
        op: "set",
        target: { kind: "selection" },
        type: "seq.counter",
        params: { width: 8 },
      },
    ]);
  });

  it("asks which one when several elements match a name", async () => {
    const nodes: ContextNode[] = [
      { id: "n_a", type: "io.led", label: "Carry" },
      { id: "n_b", type: "io.led", label: "Zero" },
    ];
    const ask = scripted({
      kind_0: "delete",
      element_0: element("LED"),
      refers_0: "named",
      node_0_1: (question) =>
        Object.entries(question.criteria).find(([, text]) =>
          text.includes('"Zero"'),
        )?.[0] ?? "none",
    });

    const result = await interpret(
      request("delete the zero LED", nodes),
      deps(ask),
    );

    expect(result.plan).toEqual([
      { op: "delete", target: { kind: "nodes", ids: ["n_b"] } },
    ]);
  });

  it("wires both ends named in one segment, to the pin it names", async () => {
    const nodes: ContextNode[] = [
      { id: "n_clk", type: "time.clock" },
      { id: "n_ff", type: "seq.dff" },
    ];
    const ask = scripted({
      kind_0: "connect",
      element_0: element("Clock"),
      refers_0: "named",
      element2_0: element("D flip-flop"),
      refers2_0: "named",
      pin_0_2: (question) =>
        Object.entries(question.criteria).find(([, text]) =>
          text.includes("CLK pin"),
        )?.[0] ?? "auto",
    });

    const result = await interpret(
      request("connect the clock to the flip-flop's clock input", nodes),
      deps(ask),
    );

    expect(result.plan).toEqual([
      {
        op: "connect",
        from: { kind: "nodes", ids: ["n_clk"] },
        to: { kind: "nodes", ids: ["n_ff"] },
        toPin: "clk",
      },
    ]);
  });

  it("says what it can do when a message asks for nothing it can", async () => {
    const ask = scripted({ kind_0: "other" });

    const result = await interpret(request("what's the weather?"), deps(ask));

    expect(result.plan).toEqual([]);
    expect(result.unsure[0]).toContain("I can place");
  });

  it("names no node type in anything it asks", async () => {
    // Guard for Non-negotiable #4: the questions come from the registry's
    // titles and docs, so a type string leaking into one means a rule here
    // started special-casing an element.
    const ask = scripted({ kind_0: "place", element_0: element("Counter") });
    await interpret(request("add a counter"), deps(ask));

    const text = JSON.stringify(ask.asked);
    for (const definition of nodeDefinitions) {
      expect(text).not.toContain(`"${definition.type}"`);
    }
  });
});
