/**
 * Cuts a request into the pieces Jev is asked about one at a time, and finds
 * the numbers and quoted strings in each.
 *
 * Jev judges; it does not generate. So anything the plan has to *copy* out of
 * the request — a size, a count, the words for a text note — is found here
 * first, as candidates, and Jev only picks among them ("select instead of
 * generate", https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook).
 * Candidates that are not found cannot be picked, so this errs on the side of
 * finding too many.
 *
 * The cuts are deliberately over-eager too. A piece that is not an
 * instruction on its own — the "the LED" of "connect the switch and the LED"
 * — is judged a continuation of the one before it, which is a question Jev
 * answers well. What the cuts must never do is split an element's *name*,
 * which no answer could repair; that is what the `and` rules below are for.
 */

export type NumberMention = {
  value: number;
  /** The words around it, so a question can say *which* 16 it means. */
  context: string;
};

export type Segment = {
  text: string;
  numbers: NumberMention[];
  /** Double-quoted strings, the only free text the plan will copy verbatim. */
  quotes: string[];
  /**
   * Whether it reads as naming two elements ("the clock *to* the flip-flop"),
   * which decides whether it is worth asking about a second one.
   */
  pairs: boolean;
};

/** More pieces than this are folded into the last; a longer request is a script. */
export const MAX_SEGMENTS = 8;

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  twenty: 20,
  "twenty-four": 24,
  "thirty-two": 32,
  "sixty-four": 64,
};

/**
 * Words that mark the `and` before them as part of a noun: "an AND gate",
 * "two and gates". An element whose title is `AND` is the reason this exists.
 */
const DETERMINERS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "each",
  "every",
  "some",
  ...Object.keys(NUMBER_WORDS),
]);

/** Words that, right after `and`, say it is naming a gate rather than joining. */
const NOUN_HEADS = new Set(["gate", "gates"]);

const SEPARATOR = /[;,]|\.(?!\d)|\b(?:and then|after that|then|also|and)\b/gi;
const PAIRING = /\b(?:to|into|onto|with|from|between)\b/i;
const QUOTE = /"([^"]+)"|“([^”]+)”/g;

export function segmentMessage(message: string): Segment[] {
  const text = message.replace(/\s+/g, " ").trim();
  const quoted = quoteRanges(text);

  const cuts: { start: number; end: number }[] = [];
  for (const match of text.matchAll(SEPARATOR)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (quoted.some((range) => start >= range.start && start < range.end)) {
      continue;
    }
    if (/^and$/i.test(match[0]) && !joins(text, start, end, match[0])) {
      continue;
    }
    cuts.push({ start, end });
  }

  const pieces: string[] = [];
  let from = 0;
  for (const cut of cuts) {
    pieces.push(text.slice(from, cut.start));
    from = cut.end;
  }
  pieces.push(text.slice(from));

  const kept = pieces.map((piece) => piece.trim()).filter(Boolean);
  if (kept.length > MAX_SEGMENTS) {
    kept.splice(
      MAX_SEGMENTS - 1,
      kept.length,
      kept.slice(MAX_SEGMENTS - 1).join(", "),
    );
  }

  return kept.map((piece) => ({
    text: piece,
    numbers: findNumbers(piece),
    quotes: findQuotes(piece),
    pairs: PAIRING.test(piece.replace(QUOTE, "")),
  }));
}

/**
 * Whether an `and` joins two things rather than naming an AND gate. An `AND`
 * in capitals is always the gate: nobody shouts a conjunction.
 */
function joins(
  text: string,
  start: number,
  end: number,
  word: string,
): boolean {
  if (word === "AND") return false;

  const before =
    text.slice(0, start).trim().split(" ").pop()?.toLowerCase() ?? "";
  const after = text.slice(end).trim().split(" ")[0]?.toLowerCase() ?? "";

  if (before === "" || DETERMINERS.has(before) || /^\d+$/.test(before)) {
    return false;
  }
  return !NOUN_HEADS.has(after.replace(/[^a-z]/g, ""));
}

function quoteRanges(text: string): { start: number; end: number }[] {
  return [...text.matchAll(QUOTE)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function findQuotes(text: string): string[] {
  return [...text.matchAll(QUOTE)]
    .map((match) => (match[1] ?? match[2] ?? "").trim())
    .filter(Boolean);
}

const NUMBER_PATTERN = new RegExp(
  `\\d+|\\b(?:${Object.keys(NUMBER_WORDS).join("|")})\\b`,
  "gi",
);

/** Enough on each side to tell "16x16 matrix" from "16 LEDs". */
const CONTEXT_CHARS = 16;

function findNumbers(text: string): NumberMention[] {
  const outsideQuotes = text.replace(QUOTE, (match) =>
    " ".repeat(match.length),
  );
  const mentions: NumberMention[] = [];

  for (const match of outsideQuotes.matchAll(NUMBER_PATTERN)) {
    const token = match[0];
    const value = /^\d+$/.test(token)
      ? Number.parseInt(token, 10)
      : NUMBER_WORDS[token.toLowerCase()];
    if (value === undefined || !Number.isSafeInteger(value)) continue;
    // One option per value: "16x16" offered as two 16s splits Jev's answer
    // between them, and a confidence that reads as a coin toss is dropped.
    if (mentions.some((mention) => mention.value === value)) continue;

    const index = match.index ?? 0;
    mentions.push({
      value,
      context: contextAround(text, index, index + token.length),
    });
  }

  return mentions;
}

/** The words around `[start, end)`, cut at word boundaries. */
function contextAround(text: string, start: number, end: number): string {
  let from = Math.max(0, start - CONTEXT_CHARS);
  let to = Math.min(text.length, end + CONTEXT_CHARS);
  while (from > 0 && text[from - 1] !== " ") from--;
  while (to < text.length && text[to] !== " ") to++;
  return text.slice(from, to).trim();
}
