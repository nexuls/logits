import type { NodeDefinition, NodeLookup, ParamSpec } from "@/lib/nodes/define";
import {
  type Answers,
  type Ask,
  answerOf,
  type ChoiceAnswer,
  type JevState,
  type Questions,
  runnerUp,
} from "./jev";
import {
  type AssistantRequest,
  type ContextNode,
  type Judgment,
  MAX_PLACE_COUNT,
  type ParamPatch,
  type PlanStep,
  type SegmentTrace,
  type Target,
} from "./protocol";
import {
  AUTO,
  adapterCatalogue,
  countQuestion,
  type ElementOption,
  elementCatalogue,
  elementQuestion,
  type Kind,
  kindQuestion,
  NONE,
  type NodeCandidate,
  nodeQuestion,
  paramQuestions,
  pinQuestion,
  type Refers,
  refersQuestion,
  turnQuestion,
  UNSPECIFIED,
  viaQuestion,
} from "./questions";
import { type Segment, segmentMessage } from "./segment";

/**
 * Turns a chat message into a plan, by asking Jev.
 *
 * At most two System One requests, each a batch answered in parallel:
 *
 * 1. **Reading.** For every segment of the message, speculatively: what it
 *    asks for, which kind of element it names (and a second one, if it reads
 *    like "the clock *to* the flip-flop"), what it refers to, and how many.
 *    Everything the plan could need is asked at once, and the answers that
 *    turn out not to apply are ignored — that is cheaper than a round trip
 *    per question (https://docs.typesafe.ai/patterns/fan-out).
 * 2. **Details**, only when the first answers need them: the settings of an
 *    element being added or changed (the options depend on which element it
 *    is), which of several matching elements on the canvas is meant, which
 *    pin a wire lands on, which way to turn.
 *
 * The code, not the model, owns the rules: what a continuation joins, how
 * "them" resolves when there is nothing to name, and the confidence below
 * which the assistant asks back instead of acting. A request is carried out
 * whole or not at all.
 */

/**
 * Below these, a judgment is not acted on. Starting points, to be tuned on
 * real requests — a Choice's confidence is how concentrated its answer is,
 * not how likely the whole plan is to be right.
 */
export const CONFIDENCE = {
  kind: 0.45,
  element: 0.35,
  node: 0.35,
  param: 0.5,
} as const;

export type Interpretation = {
  plan: PlanStep[];
  unsure: string[];
  trace: SegmentTrace[];
};

export type InterpretDeps = {
  ask: Ask;
  /** Every built-in element, in palette order. */
  definitions: readonly NodeDefinition[];
  lookup: NodeLookup;
};

type Operand = {
  segment: number;
  slot: 1 | 2;
  /** Element type it names, when it names one confidently. */
  type: string | null;
  refers: Refers;
};

type Instruction = {
  kind: Kind;
  segment: number;
  operands: Operand[];
  count: number;
};

type Pending = {
  id: string;
  apply: (answer: ChoiceAnswer) => void;
};

export async function interpret(
  request: AssistantRequest,
  deps: InterpretDeps,
): Promise<Interpretation> {
  const segments = segmentMessage(request.message);
  const catalogue = elementCatalogue(deps.definitions, request.chips);
  const typeOf = new Map(
    catalogue.options.map((option) => [option.key, option]),
  );
  const titleOf = (type: string) =>
    catalogue.options.find((option) => option.type === type)?.title ??
    deps.lookup(type)?.title ??
    type;

  const selected = request.nodes.filter((node) => node.selected);
  const recent = request.nodes.filter((node) => node.recent);
  const state: JevState = {
    message: request.message,
    segments: segments.map((segment) => segment.text),
    canvas: {
      element_count: request.nodes.length,
      selected: selected
        .slice(0, 20)
        .map((node) => describeContext(node, titleOf)),
      previously_added: recent
        .slice(0, 20)
        .map((node) => describeContext(node, titleOf)),
    },
  };

  const trace: SegmentTrace[] = segments.map((segment) => ({
    text: segment.text,
    judgments: [],
  }));
  const note = (segment: number, judgment: Judgment) =>
    trace[segment].judgments.push(judgment);

  // --- Pass 1: read every segment. ---------------------------------------

  const adapters = adapterCatalogue(deps.definitions);
  const first: Questions = {};
  if (adapters.length > 0) first.via = viaQuestion(adapters);
  segments.forEach((segment, i) => {
    first[`kind_${i}`] = kindQuestion(i);
    first[`element_${i}`] = elementQuestion(i, catalogue.criteria, 1);
    first[`refers_${i}`] = refersQuestion(i, 1, {
      recent: recent.length > 0,
      selection: selected.length > 0,
    });
    if (segment.pairs) {
      first[`element2_${i}`] = elementQuestion(i, catalogue.criteria, 2);
      first[`refers2_${i}`] = refersQuestion(i, 2, {
        recent: recent.length > 0,
        selection: selected.length > 0,
      });
    }
    if (segment.numbers.length > 0) {
      first[`count_${i}`] = countQuestion(i, segment);
    }
  });

  const read = await deps.ask(state, first);
  const unsure: string[] = [];

  const viaAnswer = adapters.length > 0 ? answerOf(read, "via") : null;
  const via =
    viaAnswer && viaAnswer.confidence >= CONFIDENCE.param
      ? (adapters.find((adapter) => adapter.key === viaAnswer.choice) ?? null)
      : null;

  const readings = segments.map((segment, i) => {
    const kind = answerOf(read, `kind_${i}`);
    note(i, {
      question: "Action",
      answer: kind.choice,
      confidence: kind.confidence,
    });

    const element = decodeElement(read, `element_${i}`, typeOf);
    if (element.option) {
      note(i, {
        question: "Element",
        answer: element.option.title,
        confidence: element.confidence,
      });
    }
    const refers = answerOf(read, `refers_${i}`);
    note(i, {
      question: "Refers to",
      answer: refers.choice,
      confidence: refers.confidence,
    });

    const second = segment.pairs
      ? decodeElement(read, `element2_${i}`, typeOf)
      : null;
    const refers2 = segment.pairs ? answerOf(read, `refers2_${i}`) : null;
    if (second?.option) {
      note(i, {
        question: "Second element",
        answer: second.option.title,
        confidence: second.confidence,
      });
    }

    let count = 1;
    if (segment.numbers.length > 0) {
      const answer = answerOf(read, `count_${i}`);
      const value = numberFor(segment, answer.choice);
      if (value !== null) count = Math.min(MAX_PLACE_COUNT, Math.max(1, value));
      note(i, {
        question: "Count",
        answer: String(count),
        confidence: answer.confidence,
      });
    }

    return {
      segment,
      index: i,
      kind: (kind.confidence >= CONFIDENCE.kind ? kind.choice : "unsure") as
        | Kind
        | "unsure",
      kindAnswer: kind,
      element,
      second,
      refers: refers.choice as Refers,
      refers2: (refers2?.choice ?? UNSPECIFIED) as Refers,
      count,
    };
  });

  // Continuations join the instruction before them; a list of things to add
  // is a list of places. With an element in between, a mention of that
  // element ("into a split node") names the bridge, not a thing to wire to.
  const instructions: Instruction[] = [];
  const others: string[] = [];
  const namesBridge = (operand: Operand) =>
    via !== null && operand.type === via.type;
  for (const reading of readings) {
    const named: Operand[] = [
      {
        segment: reading.index,
        slot: 1,
        type: confidentType(reading.element),
        refers: reading.refers,
      },
    ];
    if (
      reading.second &&
      (reading.second.option || reading.refers2 !== UNSPECIFIED)
    ) {
      named.push({
        segment: reading.index,
        slot: 2,
        type: confidentType(reading.second),
        refers: reading.refers2,
      });
    }
    const operands = named.filter((operand) => !namesBridge(operand));
    if (reading.kind === "place" && named.length > 0 && operands.length === 0) {
      // "Add a split between them": the bridge places its own, one per bus.
      continue;
    }

    if (
      reading.kind === "unsure" &&
      harmlessDoubt(reading.kindAnswer, instructions.at(-1))
    ) {
      reading.kind = "continuation";
    }
    if (reading.kind === "unsure") {
      const alternative = runnerUp(reading.kindAnswer);
      unsure.push(
        `I couldn't tell what “${reading.segment.text}” asks for${alternative ? ` — ${reading.kindAnswer.choice} or ${alternative}?` : "."}`,
      );
      continue;
    }

    if (reading.kind === "continuation") {
      const previous = instructions.at(-1);
      if (previous && previous.kind !== "place") {
        previous.operands.push(...operands);
        continue;
      }
      if (previous?.kind === "place" || reading.element.option) {
        instructions.push({
          kind: "place",
          segment: reading.index,
          operands,
          count: reading.count,
        });
        continue;
      }
      others.push(reading.segment.text);
      continue;
    }

    if (reading.kind === "other") {
      others.push(reading.segment.text);
      continue;
    }

    instructions.push({
      kind: reading.kind,
      segment: reading.index,
      operands,
      count: reading.count,
    });
  }

  // Elements that must be named confidently, or asked about.
  for (const instruction of instructions) {
    if (instruction.kind !== "place") continue;
    const operand = instruction.operands[0];
    if (operand.type) continue;

    const reading = readings[instruction.segment];
    const top = reading.element.option;
    const alternative = reading.element.runnerUp;
    unsure.push(
      top && alternative
        ? `Which element did you mean by “${reading.segment.text}” — ${top.title} or ${alternative.title}?`
        : `I couldn't tell which element “${reading.segment.text}” means. Try its name from the palette.`,
    );
  }

  if (viaAnswer) {
    const wiring = instructions.find(
      (instruction) => instruction.kind === "connect",
    );
    if (wiring) {
      note(wiring.segment, {
        question: "Through",
        answer:
          adapters.find((adapter) => adapter.key === viaAnswer.choice)?.title ??
          "nothing in between",
        confidence: viaAnswer.confidence,
      });
    }
  }

  // --- Pass 2: details that depend on the reading. -----------------------

  const nodesOf = (type: string) =>
    request.nodes.filter((node) => node.type === type);
  const placesBefore = (instruction: Instruction) =>
    instructions.filter(
      (other) =>
        other.kind === "place" &&
        other.segment < instruction.segment &&
        other.operands[0].type,
    );

  const followUp: Questions = {};
  const pending: Pending[] = [];
  const queue = (
    id: string,
    question: Questions[string],
    apply: Pending["apply"],
  ) => {
    followUp[id] = question;
    pending.push({ id, apply });
  };

  const params = new Map<Instruction, ParamPatch>();
  const namedNode = new Map<Operand, string | null>();
  const pins = new Map<Operand, string>();
  const turns = new Map<Instruction, number>();

  for (const instruction of instructions) {
    const segment = segments[instruction.segment];

    if (instruction.kind === "place" || instruction.kind === "set") {
      const type =
        instruction.operands[0].type ??
        (instruction.kind === "set"
          ? commonType(instruction.operands[0].refers, selected, recent)
          : null);
      const definition = type ? deps.lookup(type) : undefined;
      if (definition) {
        const patch: ParamPatch = {};
        params.set(instruction, patch);
        const asked = paramQuestions(
          instruction.segment,
          definition,
          segment,
          instruction.kind,
        );
        for (const { spec, question } of asked) {
          queue(
            `param_${instruction.segment}_${spec.key}`,
            question,
            (answer) => {
              const value = paramValue(spec, segment, answer);
              if (value === undefined) return;
              patch[spec.key] = value;
              note(instruction.segment, {
                question: spec.label,
                answer: String(value),
                confidence: answer.confidence,
              });
            },
          );
        }
      }
    }

    for (const operand of instruction.kind === "place"
      ? []
      : instruction.operands) {
      if (
        operand.refers !== "named" &&
        !(operand.refers === UNSPECIFIED && operand.type)
      ) {
        continue;
      }
      if (
        operand.type &&
        placesBefore(instruction).some(
          (p) => p.operands[0].type === operand.type,
        )
      ) {
        continue;
      }

      const candidates = operand.type ? nodesOf(operand.type) : request.nodes;
      if (candidates.length === 1) {
        namedNode.set(operand, candidates[0].id);
        continue;
      }
      if (candidates.length === 0 || operand.refers !== "named") continue;

      const listed = candidates
        .slice(0, 254)
        .map((node): NodeCandidate => ({ ...node, title: titleOf(node.type) }));
      queue(
        `node_${operand.segment}_${operand.slot}`,
        nodeQuestion(operand.segment, operand.slot, listed),
        (answer) => {
          const k = keyIndex(answer.choice, "c");
          const chosen = k === null ? null : listed[k];
          if (!chosen || answer.confidence < CONFIDENCE.node) {
            namedNode.set(operand, null);
            const alternative = keyIndex(runnerUp(answer) ?? "", "c");
            const options = [
              chosen,
              alternative === null ? undefined : listed[alternative],
            ]
              .filter((candidate): candidate is NodeCandidate =>
                Boolean(candidate),
              )
              .map((candidate) => nameOf(candidate));
            unsure.push(
              options.length > 1
                ? `Which one did you mean in “${segment.text}” — ${options.join(" or ")}?`
                : `I couldn't tell which element “${segment.text}” means.`,
            );
            return;
          }
          namedNode.set(operand, chosen.id);
          note(operand.segment, {
            question: "Which one",
            answer: nameOf(chosen),
            confidence: answer.confidence,
          });
        },
      );
    }

    if (instruction.kind === "connect") {
      for (const operand of instruction.operands.slice(0, 2)) {
        const definition = operand.type ? deps.lookup(operand.type) : undefined;
        if (!definition) continue;
        const pinList = definition.pins(definition.defaultParams);
        if (pinList.length < 2) continue;

        queue(
          `pin_${operand.segment}_${operand.slot}`,
          pinQuestion(operand.segment, definition.title, pinList),
          (answer) => {
            if (answer.choice === AUTO || answer.confidence < CONFIDENCE.param)
              return;
            const k = keyIndex(answer.choice, "k");
            const pin = k === null ? undefined : pinList[k];
            if (!pin) return;
            pins.set(operand, pin.id);
            note(operand.segment, {
              question: "Pin",
              answer: `${definition.title} ${pin.name}`,
              confidence: answer.confidence,
            });
          },
        );
      }
    }

    if (instruction.kind === "rotate") {
      queue(
        `turn_${instruction.segment}`,
        turnQuestion(instruction.segment),
        (answer) => {
          turns.set(
            instruction,
            answer.choice === "ccw" ? -1 : answer.choice === "half" ? 2 : 1,
          );
          note(instruction.segment, {
            question: "Turn",
            answer: answer.choice,
            confidence: answer.confidence,
          });
        },
      );
    }
  }

  if (pending.length > 0 && unsure.length === 0) {
    const details = await deps.ask(state, followUp);
    for (const { id, apply } of pending) apply(answerOf(details, id));
  }

  if (unsure.length > 0) return { plan: [], unsure, trace };

  // --- Resolve into steps. -----------------------------------------------

  const plan: PlanStep[] = [];
  const placeStep = new Map<Instruction, number>();
  let bridged = false;
  /**
   * Adds a wiring step, through the element in between if there is one, and
   * never twice: "connect them … wire them up" is one wiring, and a second
   * pass would find every pin taken and fail the whole request.
   */
  const wire = (step: Extract<PlanStep, { op: "connect" }>) => {
    const full: PlanStep = via ? { ...step, via: via.type } : step;
    const key = JSON.stringify(full);
    if (plan.some((earlier) => JSON.stringify(earlier) === key)) return;
    plan.push(full);
  };

  const resolve = (
    instruction: Instruction,
    operand: Operand,
  ): Target | null => {
    const placedMatch = () => {
      const match = [...placeStep]
        .filter(([other]) => other.segment < instruction.segment)
        .filter(
          ([other]) => !operand.type || other.operands[0].type === operand.type,
        )
        .at(-1);
      return match ? ({ kind: "placed", step: match[1] } as const) : null;
    };

    switch (operand.refers) {
      case "placed":
        return placedMatch();
      case "recent": {
        const ids = recent
          .filter((node) => !operand.type || node.type === operand.type)
          .map((node) => node.id);
        return ids.length > 0 ? { kind: "nodes", ids } : null;
      }
      case "selection": {
        if (!operand.type) return { kind: "selection" };
        const ids = selected
          .filter((node) => node.type === operand.type)
          .map((node) => node.id);
        return ids.length > 0 ? { kind: "nodes", ids } : { kind: "selection" };
      }
      case "every":
        return operand.type ? { kind: "type", type: operand.type } : null;
      case "everything":
        return { kind: "all" };
      case "named":
      case "unspecified": {
        const placed = operand.type ? placedMatch() : null;
        if (placed) return placed;
        const id = namedNode.get(operand);
        return id ? { kind: "nodes", ids: [id] } : null;
      }
    }
  };

  for (const instruction of instructions) {
    const text = segments[instruction.segment].text;
    const targets = instruction.operands
      .map((operand) => ({ operand, target: resolve(instruction, operand) }))
      .filter(
        (entry): entry is { operand: Operand; target: Target } =>
          entry.target !== null,
      );

    switch (instruction.kind) {
      case "place": {
        const type = instruction.operands[0].type;
        if (!type) break;
        placeStep.set(instruction, plan.length);
        plan.push({
          op: "place",
          type,
          count: instruction.count,
          params: params.get(instruction) ?? {},
        });
        break;
      }

      case "connect": {
        const earlier = [...placeStep]
          .filter(([other]) => other.segment < instruction.segment)
          .map(([, step]) => step);
        // "…then connect them" names nothing of its own: it means everything
        // the message just added, in the order it was listed.
        const pronounOnly = instruction.operands.every(
          (operand) =>
            !operand.type &&
            (operand.refers === "placed" || operand.refers === UNSPECIFIED),
        );

        // With an element in between, the message describes one wiring,
        // usually over several sentences ("each pin into a split", "then on
        // to the matrices", "for all the pins"): it spans what the message
        // added, and is done once.
        if (via && earlier.length >= 2) {
          if (!bridged) {
            for (let k = 0; k + 1 < earlier.length; k++) {
              wire({
                op: "connect",
                from: { kind: "placed", step: earlier[k] },
                to: { kind: "placed", step: earlier[k + 1] },
              });
            }
            bridged = true;
          }
          break;
        }

        if (targets.length >= 2 && !(pronounOnly && earlier.length >= 2)) {
          for (let k = 0; k + 1 < targets.length; k++) {
            const from = targets[k];
            const to = targets[k + 1];
            wire({
              op: "connect",
              from: from.target,
              to: to.target,
              ...(pins.has(from.operand)
                ? { fromPin: pins.get(from.operand) }
                : {}),
              ...(pins.has(to.operand) ? { toPin: pins.get(to.operand) } : {}),
            });
          }
          break;
        }

        if (targets.length === 1 && !(pronounOnly && earlier.length >= 2)) {
          const only = targets[0].target;
          const unreferenced = earlier.filter(
            (step) => !(only.kind === "placed" && only.step === step),
          );
          wire(
            unreferenced.length > 0
              ? {
                  op: "connect",
                  from: { kind: "placed", step: unreferenced.at(-1) as number },
                  to: only,
                }
              : { op: "connect", from: only },
          );
          break;
        }

        if (earlier.length >= 2) {
          for (let k = 0; k + 1 < earlier.length; k++) {
            wire({
              op: "connect",
              from: { kind: "placed", step: earlier[k] },
              to: { kind: "placed", step: earlier[k + 1] },
            });
          }
        } else if (selected.length >= 2) {
          wire({ op: "connect", from: { kind: "selection" } });
        } else if (recent.length >= 2) {
          wire({
            op: "connect",
            from: { kind: "nodes", ids: recent.map((node) => node.id) },
          });
        } else {
          unsure.push(
            `I couldn't tell what to wire in “${text}”. Name both ends, or select them first.`,
          );
        }
        break;
      }

      case "delete":
      case "rotate":
      case "select": {
        const chosen =
          targets.length > 0
            ? targets.map((entry) => entry.target)
            : selected.length > 0
              ? [{ kind: "selection" } as const]
              : [];
        if (chosen.length === 0) {
          unsure.push(`I couldn't tell which elements “${text}” means.`);
          break;
        }
        for (const target of chosen) {
          if (instruction.kind === "rotate") {
            plan.push({
              op: "rotate",
              target,
              quarterTurns: turns.get(instruction) ?? 1,
            });
          } else {
            plan.push({ op: instruction.kind, target });
          }
        }
        break;
      }

      case "set": {
        const type =
          instruction.operands[0].type ??
          commonType(instruction.operands[0].refers, selected, recent);
        const patch = params.get(instruction) ?? {};
        if (!type || Object.keys(patch).length === 0) {
          unsure.push(`I couldn't tell what to change in “${text}”.`);
          break;
        }
        const chosen =
          targets.length > 0
            ? targets.map((entry) => entry.target)
            : selected.length > 0
              ? [{ kind: "selection" } as const]
              : nodesOf(type).length > 0
                ? [{ kind: "type", type } as const]
                : [];
        if (chosen.length === 0) {
          unsure.push(`There is no ${titleOf(type)} on the canvas to change.`);
          break;
        }
        for (const target of chosen)
          plan.push({ op: "set", target, type, params: patch });
        break;
      }

      case "play":
      case "pause":
      case "step":
      case "reset":
        plan.push({ op: "run", action: instruction.kind });
        break;

      case "undo":
      case "redo":
        plan.push({ op: "history", action: instruction.kind });
        break;
    }
  }

  if (unsure.length > 0) return { plan: [], unsure, trace };
  if (plan.length === 0 && others.length > 0) {
    return {
      plan: [],
      unsure: [
        `“${others.join(", ")}” isn't something I can do on the canvas. I can place, wire, change, rotate, select and delete elements, and run, pause, step or reset the simulation.`,
      ],
      trace,
    };
  }
  return { plan, unsure: [], trace };
}

/**
 * A doubt that changes nothing. Torn between "continuation" and the action of
 * the instruction before it — "do this for all the pins" after a wiring — both
 * readings add to that instruction, so asking the user which would be asking
 * about a difference that is not there. Only when the two together carry the
 * answer; a spread across unrelated actions is still a real doubt.
 */
function harmlessDoubt(
  answer: ChoiceAnswer,
  previous: Instruction | undefined,
): boolean {
  const other = runnerUp(answer);
  if (!previous || !other) return false;

  const pair = new Set([answer.choice, other]);
  const together =
    (answer.probabilities[answer.choice] ?? 0) +
    (answer.probabilities[other] ?? 0);
  return (
    pair.has("continuation") &&
    pair.has(previous.kind) &&
    together >= HARMLESS_TOGETHER
  );
}

/** How much of the answer the two harmless readings must hold between them. */
const HARMLESS_TOGETHER = 0.8;

type ElementReading = {
  option: ElementOption | null;
  confidence: number;
  runnerUp: ElementOption | null;
};

function decodeElement(
  answers: Answers,
  id: string,
  typeOf: ReadonlyMap<string, ElementOption>,
): ElementReading {
  const answer = answerOf(answers, id);
  const other = runnerUp(answer);
  return {
    option: answer.choice === NONE ? null : (typeOf.get(answer.choice) ?? null),
    confidence: answer.confidence,
    runnerUp: other ? (typeOf.get(other) ?? null) : null,
  };
}

function confidentType(reading: ElementReading): string | null {
  return reading.option && reading.confidence >= CONFIDENCE.element
    ? reading.option.type
    : null;
}

/** The one type every node a pronoun could mean shares, if they share one. */
function commonType(
  refers: Refers,
  selected: readonly ContextNode[],
  recent: readonly ContextNode[],
): string | null {
  const pool =
    refers === "recent" ? recent : selected.length > 0 ? selected : recent;
  const types = new Set(pool.map((node) => node.type));
  return types.size === 1 ? [...types][0] : null;
}

function numberFor(segment: Segment, key: string): number | null {
  const k = keyIndex(key, "n");
  return k === null ? null : (segment.numbers[k]?.value ?? null);
}

function paramValue(
  spec: ParamSpec,
  segment: Segment,
  answer: ChoiceAnswer,
): ParamPatch[string] | undefined {
  if (answer.choice === UNSPECIFIED || answer.confidence < CONFIDENCE.param) {
    return undefined;
  }
  switch (spec.kind) {
    case "int":
      return numberFor(segment, answer.choice) ?? undefined;
    case "select":
    case "color": {
      const k = keyIndex(answer.choice, "o");
      return k === null ? undefined : spec.options[k]?.value;
    }
    case "bool":
      return answer.choice === "on"
        ? true
        : answer.choice === "off"
          ? false
          : undefined;
    case "text": {
      const k = keyIndex(answer.choice, "q");
      return k === null ? undefined : segment.quotes[k];
    }
  }
}

/** `"c12"` → 12 for prefix `"c"`; null for anything else. */
function keyIndex(key: string, prefix: string): number | null {
  if (!key.startsWith(prefix)) return null;
  const k = Number(key.slice(prefix.length));
  return Number.isInteger(k) && k >= 0 ? k : null;
}

function nameOf(candidate: NodeCandidate): string {
  return candidate.label
    ? `the ${candidate.title} “${candidate.label}”`
    : `the ${candidate.title}`;
}

function describeContext(
  node: ContextNode,
  titleOf: (type: string) => string,
): string {
  return node.label
    ? `${titleOf(node.type)} "${node.label}"`
    : titleOf(node.type);
}
