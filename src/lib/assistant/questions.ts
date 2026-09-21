import type { NodeDefinition, ParamSpec } from "@/lib/nodes/define";
import { type ChoiceQuestion, choice } from "./jev";
import type { Segment } from "./segment";

/**
 * The questions the assistant asks Jev, and what their option keys mean.
 *
 * Every option is written out in full, because Jev reads only the text —
 * question ids and option keys are for this code. Each question also names the
 * segment it is about by its path in the state (`segments[2]`) and says it
 * was cut from `message`, so a piece like "the LED" is still read in the
 * sentence it came from.
 *
 * Nothing here names a node type. The element catalogue is the registry's own
 * titles, docs and keywords, and parameter questions are built from each
 * definition's `paramsSchema` — so a node added to the registry is something
 * the assistant can place and configure with no change in this folder.
 */

export const KINDS = {
  place:
    "Adds new elements to the canvas: 'place', 'add', 'put', 'insert', 'drop', 'give me', or simply naming the elements to add.",
  connect:
    "Wires elements together: 'connect', 'wire', 'hook up', 'link', 'join', 'feed … into …', 'drive … with …'.",
  delete:
    "Removes elements already on the canvas: 'delete', 'remove', 'clear', 'get rid of'.",
  set: "Changes a setting of elements already on the canvas, such as a size, bit width, colour, period or number of inputs: 'set', 'make it', 'change', 'resize'.",
  rotate: "Turns elements already on the canvas: 'rotate', 'turn', 'flip'.",
  select: "Selects or highlights elements: 'select', 'highlight', 'pick'.",
  play: "Starts or resumes the simulation: 'run', 'start', 'play', 'resume'.",
  pause: "Pauses or stops the simulation: 'pause', 'stop', 'halt', 'freeze'.",
  step: "Advances the simulation by one step: 'step', 'tick', 'advance'.",
  reset:
    "Resets the simulation to time zero: 'reset', 'restart the simulation'.",
  undo: "Undoes the last change: 'undo', 'take that back', 'revert that'.",
  redo: "Redoes the change that was just undone: 'redo'.",
  continuation:
    "Not an instruction on its own: it names one more element for the instruction in the segment before it, like 'the LED' in 'connect the switch and the LED', or 'a draw pad' in 'place a matrix, a draw pad'.",
  other:
    "None of these: a question, a greeting, thanks, or something the canvas editor cannot do.",
} as const;
export type Kind = keyof typeof KINDS;

export const REFERS = {
  placed:
    "Elements added earlier in this same `message`: 'it', 'them', 'both', 'the pins' right after something was added.",
  recent:
    "Elements added in reply to the previous message, listed in `canvas.previously_added`: 'them', 'those', 'it'.",
  selection:
    "The elements currently selected, listed in `canvas.selected`: 'this', 'these', 'the selection', 'the selected ones'.",
  named:
    "One particular element already on the canvas that it names or describes, such as 'the clock' or 'the LED labelled A'.",
  every:
    "Every element of the kind it names: 'all the LEDs', 'every gate', 'the switches'.",
  everything: "The whole circuit: 'everything', 'all of it', 'the canvas'.",
  unspecified:
    "No existing element: it adds new elements, or names nothing to act on.",
} as const;
export type Refers = keyof typeof REFERS;

export const NONE = "none";
export const UNSPECIFIED = "unspecified";
export const AUTO = "auto";

/** A catalogue entry: a type Jev can pick, under an option key. */
export type ElementOption = { key: string; type: string; title: string };

const SUMMARY_CHARS = 120;

export function elementCatalogue(
  definitions: readonly NodeDefinition[],
  chips: readonly { type: string; title: string }[],
): { options: ElementOption[]; criteria: Record<string, string> } {
  const options: ElementOption[] = [];
  const criteria: Record<string, string> = {};

  for (const definition of definitions) {
    const key = `e${options.length}`;
    options.push({ key, type: definition.type, title: definition.title });
    criteria[key] = describeElement(definition);
  }
  for (const chip of chips) {
    const key = `e${options.length}`;
    options.push({ key, type: chip.type, title: chip.title });
    criteria[key] =
      `${chip.title}: a subcircuit (chip) defined in this project.`;
  }
  criteria[NONE] =
    "No element kind: it refers to elements only as 'it', 'them', 'the pins', 'the selection', or names none at all.";

  return { options, criteria };
}

function describeElement(definition: NodeDefinition): string {
  const aka = [
    definition.shortTitle,
    ...(definition.keywords ?? []).slice(0, 6),
  ]
    .filter(Boolean)
    .join(", ");
  const summary = firstSentence(definition.docs ?? "");
  return [`${definition.title}.`, summary, aka ? `Also called: ${aka}.` : ""]
    .filter(Boolean)
    .join(" ");
}

/** The opening sentence of a doc, stripped of Markdown. */
function firstSentence(markdown: string): string {
  const plain = markdown
    .trim()
    .split(/\n\s*\n/)[0]
    .replace(/[*`_#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const end = plain.search(/[.:;](\s|$)/);
  const sentence = end === -1 ? plain : plain.slice(0, end + 1);
  return sentence.length > SUMMARY_CHARS
    ? `${sentence.slice(0, SUMMARY_CHARS - 1).trimEnd()}…`
    : sentence;
}

const at = (index: number) => `\`segments[${index}]\``;

export function kindQuestion(index: number): ChoiceQuestion {
  return choice(
    `What does ${at(index)} ask the circuit editor to do? It is one piece of \`message\`, which was split at commas and joining words, so read it as part of that sentence.`,
    { ...KINDS },
  );
}

export function elementQuestion(
  index: number,
  criteria: Record<string, string>,
  slot: 1 | 2,
): ChoiceQuestion {
  return choice(
    slot === 1
      ? `Which kind of circuit element does ${at(index)} name — the element to add, wire, change, rotate, select or remove? If it names two, pick the first one it names.`
      : `${at(index)} may name two elements, as in 'connect the clock to the flip-flop'. Which kind of element is the second one it names?`,
    criteria,
  );
}

export function refersQuestion(
  index: number,
  slot: 1 | 2,
  available: { recent: boolean; selection: boolean },
): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  for (const [key, meaning] of Object.entries(REFERS)) {
    if (key === "recent" && !available.recent) continue;
    if (key === "selection" && !available.selection) continue;
    criteria[key] = meaning;
  }
  return choice(
    slot === 1
      ? `Which elements does ${at(index)} act on? If it names two, answer for the first one it names.`
      : `Which elements is the second one named in ${at(index)} (as in the flip-flop of 'connect the clock to the flip-flop')?`,
    criteria,
  );
}

export function countQuestion(index: number, segment: Segment): ChoiceQuestion {
  const criteria: Record<string, string> = {
    one: "One element: no count is given, or it says 'a', 'an' or 'one'.",
  };
  segment.numbers.forEach((mention, k) => {
    criteria[`n${k}`] =
      `${mention.value} copies, from the "${mention.value}" in "${mention.context}".`;
  });
  return choice(
    `If ${at(index)} adds elements, how many copies does it ask for? A size such as the 16s in '16x16', or a width such as the 4 in '4-bit', describes each element and is not a count.`,
    criteria,
  );
}

/**
 * One question per setting the element offers, over the values the segment
 * actually contains. Returns the settings it asked about, in question order,
 * so the answers can be decoded with the same candidates.
 */
export function paramQuestions(
  index: number,
  definition: NodeDefinition,
  segment: Segment,
  mode: "place" | "set",
): { spec: ParamSpec; question: ChoiceQuestion }[] {
  const out: { spec: ParamSpec; question: ChoiceQuestion }[] = [];
  const unspecified =
    mode === "place"
      ? "It gives no value for this setting, so the default is kept."
      : "It leaves this setting as it is.";

  for (const spec of definition.paramsSchema ?? []) {
    const criteria: Record<string, string> = { [UNSPECIFIED]: unspecified };

    switch (spec.kind) {
      case "int":
        if (segment.numbers.length === 0) continue;
        segment.numbers.forEach((mention, k) => {
          criteria[`n${k}`] =
            `${mention.value}, from the "${mention.value}" in "${mention.context}".`;
        });
        break;
      case "select":
      case "color":
        spec.options.forEach((option, k) => {
          criteria[`o${k}`] = option.label;
        });
        break;
      case "bool":
        criteria.on = `Turns "${spec.label}" on.`;
        criteria.off = `Turns "${spec.label}" off.`;
        break;
      case "text":
        if (segment.quotes.length === 0) continue;
        segment.quotes.forEach((quote, k) => {
          criteria[`q${k}`] = `"${quote}"`;
        });
        break;
    }

    const hint = spec.hint ? ` (${spec.hint.replace(/\.$/, "")})` : "";
    out.push({
      spec,
      question: choice(
        mode === "place"
          ? `${at(index)} adds a ${definition.title}. What does it ask for its "${spec.label}"${hint} to be?`
          : `${at(index)} changes a ${definition.title}. What does it set its "${spec.label}"${hint} to?`,
        criteria,
      ),
    });
  }

  return out;
}

export type NodeCandidate = {
  id: string;
  title: string;
  label?: string;
  selected?: boolean;
  recent?: boolean;
};

export function nodeQuestion(
  index: number,
  slot: 1 | 2,
  candidates: readonly NodeCandidate[],
): ChoiceQuestion {
  const criteria: Record<string, string> = {};
  candidates.forEach((candidate, k) => {
    const notes = [
      candidate.label ? `labelled "${candidate.label}"` : "",
      candidate.selected ? "currently selected" : "",
      candidate.recent ? "added in reply to the previous message" : "",
    ].filter(Boolean);
    criteria[`c${k}`] =
      `The ${candidate.title}${notes.length > 0 ? `, ${notes.join(", ")}` : ""}.`;
  });
  criteria[NONE] = "None of these elements.";

  return choice(
    slot === 1
      ? `Which element on the canvas does ${at(index)} mean? If it names two, answer for the first.`
      : `Which element on the canvas is the second one named in ${at(index)}?`,
    criteria,
  );
}

export function pinQuestion(
  index: number,
  title: string,
  pins: readonly {
    id: string;
    name: string;
    direction: string;
    width: number;
  }[],
): ChoiceQuestion {
  const criteria: Record<string, string> = {
    [AUTO]:
      "No particular pin: it names the element only, or says 'the pins', 'them' or 'together'.",
  };
  pins.forEach((pin, k) => {
    const role =
      pin.direction === "in"
        ? "input"
        : pin.direction === "out"
          ? "output"
          : "bidirectional";
    criteria[`k${k}`] =
      `The ${title}'s ${pin.name} pin (${role}, ${pin.width} bit${pin.width === 1 ? "" : "s"}).`;
  });
  return choice(
    `Does ${at(index)} name a particular pin of the ${title}, such as 'CLK', 'EN' or 'input A'?`,
    criteria,
  );
}

export function turnQuestion(index: number): ChoiceQuestion {
  return choice(`Which way does ${at(index)} turn the elements?`, {
    cw: "A quarter turn clockwise: 'rotate', 'turn', 'rotate right', '90 degrees'.",
    ccw: "A quarter turn anticlockwise: 'rotate left', 'counterclockwise', '-90 degrees'.",
    half: "A half turn: 'flip', 'upside down', '180 degrees'.",
  });
}

/** An element that re-shapes a bus, as the "in between" question offers it. */
export type Adapter = {
  key: string;
  type: string;
  title: string;
  kind: "split" | "merge";
};

/** Every re-shaping element the registry declares, first of each kind. */
export function adapterCatalogue(
  definitions: readonly NodeDefinition[],
): Adapter[] {
  const adapters: Adapter[] = [];
  for (const definition of definitions) {
    const kind = definition.reshape?.kind;
    if (!kind || adapters.some((adapter) => adapter.kind === kind)) continue;
    adapters.push({
      key: `via_${kind}`,
      type: definition.type,
      title: definition.title,
      kind,
    });
  }
  return adapters;
}

/**
 * Asked of the whole message, not a segment: "take each pin into a split,
 * then on to the displays" spreads one wiring over several sentences.
 */
export function viaQuestion(adapters: readonly Adapter[]): ChoiceQuestion {
  const criteria: Record<string, string> = {
    [NONE]:
      "The wires go straight from pin to pin, with no element placed in between — or `message` wires nothing at all.",
  };
  for (const adapter of adapters) {
    criteria[adapter.key] =
      adapter.kind === "split"
        ? `Each wide bus goes into a ${adapter.title} placed in between, which cuts it into narrower buses so one wide output can feed several narrower inputs: 'into a split node', 'split each row across the displays', 'through splitters'.`
        : `Narrow buses are joined into a wider one by a ${adapter.title} placed in between: 'merge the rows into one bus', 'through a merge', 'combine them into one bus'.`;
  }
  return choice(
    "Does `message` ask for the wires between its elements to pass through an element placed in between them?",
    criteria,
  );
}
