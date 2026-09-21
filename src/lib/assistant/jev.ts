/**
 * The slice of TypeSafe's System One API the assistant uses: Choice questions
 * over a JSON state. See https://docs.typesafe.ai/primitives/choice.
 *
 * Only the types live here, shaped to match `@typesafe-ai/sdk` so the route
 * can hand its answers straight through. The call itself is `Ask`, injected
 * by the route, so everything that decides *what* to ask and what the answers
 * mean runs in a plain Node test with scripted answers, and this layer never
 * touches the network or an API key.
 */

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  /** Option key → what that option means. Keys are for code; Jev reads the text. */
  criteria: Record<string, string>;
};

export type Questions = Record<string, ChoiceQuestion>;

export type ChoiceAnswer = {
  readonly choice: string;
  /** How concentrated the distribution is, 0–1. Not a promise of correctness. */
  readonly confidence: number;
  readonly probabilities: { readonly [key: string]: number };
};

export type Answers = Record<string, ChoiceAnswer>;

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Text only: System One reads JSON, never a picture of the canvas. */
export type JevState = { [key: string]: Json };

/** One System One request: every question is answered over the same state, in parallel. */
export type Ask = (state: JevState, questions: Questions) => Promise<Answers>;

/**
 * Jev's answers must cover every question asked; a missing one is a service
 * fault, not something to guess around.
 */
export class MissingAnswerError extends Error {
  constructor(questionId: string) {
    super(`Jev returned no answer for "${questionId}"`);
    this.name = "MissingAnswerError";
  }
}

export function choice(
  instructions: string,
  criteria: Record<string, string>,
): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

export function answerOf(answers: Answers, questionId: string): ChoiceAnswer {
  const answer = answers[questionId];
  if (!answer) throw new MissingAnswerError(questionId);
  return answer;
}

/** The runner-up, for a question worth asking back when the top pick is weak. */
export function runnerUp(answer: ChoiceAnswer): string | null {
  let best: string | null = null;
  let bestProbability = -1;
  for (const [key, probability] of Object.entries(answer.probabilities)) {
    if (key === answer.choice || probability <= bestProbability) continue;
    best = key;
    bestProbability = probability;
  }
  return best;
}
