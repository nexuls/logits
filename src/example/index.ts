import { fromJson } from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import fullAdder from "./full-adder.json";
import gateSampler from "./gate-sampler.json";
import halfAdder from "./half-adder.json";
import masterSlaveFlipFlop from "./master-slave-flipflop.json";
import mux2to1 from "./mux-2to1.json";
import srLatch from "./sr-latch.json";
import tristateBus from "./tristate-bus.json";

/**
 * The circuits shipped with the app.
 *
 * Each `.json` here is an ordinary `.logits.json` save file — nothing about
 * the format is special, so an example can be exported from the editor,
 * hand-tuned and dropped straight back in. The blurb lives in the catalog
 * below rather than in the file, because the document schema has no field for
 * it and inventing one would put prose in every user's save format.
 *
 * Pure data: this module loads through `fromJson` and touches no browser API,
 * so it runs in a plain Node test like the rest of the domain layer. Opening
 * an example is `src/state/document.ts`'s job, and importing one is
 * `src/state/projects-store.ts`'s.
 */

export type Example = {
  id: string;
  name: string;
  /** One line, shown under the name in the sidebar. */
  summary: string;
  document: CircuitDocument;
};

const CATALOG: readonly { raw: unknown; summary: string }[] = [
  {
    raw: gateSampler,
    summary: "Every basic gate driven by the same two switches.",
  },
  { raw: halfAdder, summary: "Two bits in, sum and carry out." },
  { raw: fullAdder, summary: "Two half adders and an OR, carry chained." },
  { raw: mux2to1, summary: "Select picks which input reaches the output." },
  { raw: srLatch, summary: "Cross-coupled NOR gates that remember a bit." },
  { raw: tristateBus, summary: "Two drivers sharing one net, with Z and X." },
  {
    raw: masterSlaveFlipFlop,
    summary: "Two latches in series, clocked by opposite edges.",
  },
];

/**
 * Validated at module load rather than on open, so a malformed example is one
 * missing entry instead of a crash in the editor. `examples.test.ts` asserts
 * the catalog loads whole, which is where an authoring mistake should surface.
 */
export const examples: readonly Example[] = CATALOG.flatMap(
  ({ raw, summary }) => {
    const loaded = fromJson(raw);
    if (!loaded.ok || loaded.issues.length > 0) return [];

    const { document } = loaded;
    return [{ id: document.id, name: document.name, summary, document }];
  },
);

const byId = new Map(examples.map((example) => [example.id, example]));

/** Undefined for an id that is not an example — a project id, say. */
export function getExample(id: string): Example | undefined {
  return byId.get(id);
}
