import type { PinSpec } from "@/lib/circuit/schema";
import {
  boolParam,
  defineNode,
  type EvalContext,
  type NodeDefinition,
} from "@/lib/nodes/define";
import {
  AND2,
  combine,
  createSignal,
  HIGH,
  LOW,
  type LogicValue,
  type Signal,
  X,
} from "@/lib/sim/logic";
import { detectEdge, edgeMode, NO_LEVEL } from "../edges";
import {
  controlState,
  EDGE_PARAM,
  spread,
  widthOf,
  widthParam,
} from "../shared";

/**
 * The parts every clocked node in `seq.*` shares: how a stored value survives
 * between evaluations, and the reset/enable/clock frame around it.
 *
 * `seq.dff` and `seq.register` are the *same* node with a different pin set,
 * so they go through `registerLike` rather than being copies of each other;
 * `seq.jkff` and `seq.tff` differ only in their next-state function, so they
 * go through `bitFlop`.
 */

/**
 * Appended to the help of every clocked node built here, so the rules about
 * what an unwired control pin means — which are the same rules for all of
 * them, and the ones people get wrong — are written once.
 */
const SHARED_CLOCKED_DOCS = `
## Control pins

Pin placement follows the catalog convention: data on the left, outputs on the
right, the clock on the bottom edge, and the asynchronous controls across the
top.

An **unwired pin floats at \`Z\`**, and what that means depends on the pin:

| Pin | Unwired | Held low | Held high |
| :-- | :-- | :-- | :-- |
| \`RST\` | idle — no reset | idle | clears the stored value |
| \`SET\` | idle — no set | idle | fills the stored value with 1s |
| \`EN\` | **enabled** | disabled — the clock is ignored | enabled |
| \`CLK\` | never clocks | never clocks | never clocks — it is the *edge* that counts |

An enable reads the opposite way round from a reset on purpose: a flip-flop
with nothing wired to \`EN\` is the common case and must still clock, while
one with nothing wired to \`RST\` must not sit permanently in reset.

Reset beats set, the way a real part's asynchronous clear does, so asserting
both gives a defined answer rather than an \`X\`.

## Edges, and what counts as one

The clock is compared against the level read last time.

- \`0\` → \`1\` is a rising edge, \`1\` → \`0\` a falling one, and
  **Clock edge** picks which one this part acts on.
- Coming out of \`Z\` is **not** an edge. Every circuit starts undriven, and
  counting the first driven level as an edge would clock the whole sheet once
  at power-up.
- An edge into or out of \`X\` is *unknowable*, and puts \`X\` on the
  output rather than guessing. That is what an uninitialised or contended
  clock looks like — if outputs read \`X\` and stay there, the clock is
  usually what to check first.

## On the canvas

1. Place the element, then wire \`CLK\` from \`time.clock\` (or from an
   \`io.button\` through \`time.oneshot\`, to step it by hand).
2. Wire the data pins on the left and take the outputs off the right.
3. Select it to open the inspector for the settings above.

Stored values are **simulation state**, not document state: they are rebuilt
from scratch on every reset, and a structural edit — changing **Bit width**,
or rewiring a pin — resets them too. Only \`params\` survive, which is why a
switch position does and a latched bit does not.
`;

/** Body of a flip-flop: wide enough for three control pins across the top. */
const BODY_WIDTH = 8;
const BODY_HEIGHT = 6;

/**
 * Stored state is JSON, never a `Uint8Array` — `createState` is re-run on
 * every reset and the contract says the result is serialisable, so the value
 * is held as a plain array of bit codes and rehydrated on each evaluation.
 */
export type StoredBits = number[];

export function storeBits(signal: Signal): StoredBits {
  return Array.from(signal);
}

/** Re-widens a stored value, so changing `width` mid-run degrades to X. */
export function loadBits(stored: unknown, width: number): Signal {
  const out = createSignal(width, X);
  if (Array.isArray(stored)) {
    for (let i = 0; i < Math.min(width, stored.length); i++) {
      const bit = stored[i];
      if (typeof bit === "number" && bit >= 0 && bit <= 3) out[i] = bit;
    }
  }
  return out;
}

export function fill(width: number, value: LogicValue): Signal {
  return createSignal(width, value);
}

/** `qn` is `q` inverted, with Z normalised — never a second stored value. */
export function invert(signal: Signal, width: number): Signal {
  return combine([signal], width, AND2, true);
}

type ClockedState = {
  q: StoredBits;
  clk: LogicValue | typeof NO_LEVEL;
};

/**
 * Runs the reset/set/enable/clock frame and returns the new stored value.
 *
 * `nextValue` is only called on a clean edge with the node enabled and no
 * asynchronous control asserted — everything a flip-flop has in common is
 * decided here, and what makes a D different from a JK is that one function.
 */
function clocked(
  ctx: EvalContext,
  width: number,
  options: {
    /** Present only on the nodes that have a `set` pin. */
    hasSet: boolean;
    hasEnable: boolean;
    nextValue: (current: Signal) => Signal;
  },
): Signal {
  const state = ctx.state as ClockedState;
  let q = loadBits(state.q, width);

  const async = boolParam(ctx.params, "asyncReset", true);
  const rst = controlState(ctx.read("rst")[0] as LogicValue);
  const set = options.hasSet
    ? controlState(ctx.read("set")[0] as LogicValue)
    : "idle";

  // Reset beats set, the way a real part's asynchronous clear does, so a
  // circuit holding both gets a defined answer rather than an X.
  const asyncActive = async && (rst !== "idle" || set !== "idle");
  if (async) {
    if (rst === "asserted") q = fill(width, LOW);
    else if (set === "asserted") q = fill(width, HIGH);
    else if (asyncActive) q = fill(width, X);
  }

  const clk = ctx.read("clk")[0] as LogicValue;
  const edge = detectEdge(state.clk, clk, edgeMode(ctx.params.edge));
  state.clk = clk;

  if (!asyncActive && edge !== "none") {
    if (edge === "unknown") {
      q = fill(width, X);
    } else {
      // An unconnected enable reads Z and means "enabled": a flip-flop with
      // nothing wired to `en` is the common case and must still clock.
      // `en` does not go through `controlState`: its idle meaning is the
      // opposite of a reset's. An unwired enable reads Z and must *enable* —
      // only a pin actually held low disables the clock.
      const en = options.hasEnable ? (ctx.read("en")[0] as LogicValue) : HIGH;
      if (en !== LOW) {
        const next =
          !async && rst === "asserted"
            ? fill(width, LOW)
            : !async && set === "asserted"
              ? fill(width, HIGH)
              : options.nextValue(q);
        q = en === X ? fill(width, X) : next;
      }
    }
  }

  state.q = storeBits(q);
  return q;
}

type RegisterSpec = {
  type: string;
  title: string;
  /** The abbreviation the canvas writes on the body — `"DFF"`, `"JKFF"`. */
  shortTitle?: string;
  /** Renderer name — `"block"` until this part is drawn as a real symbol. */
  view?: string;
  icon: string;
  keywords: readonly string[];
  /** Markdown help, rendered by the palette's info dialog. */
  docs: string;
  /** `seq.dff` has `set` and `qn`; `seq.register` has neither. */
  hasSet: boolean;
  hasQn: boolean;
};

/** `seq.dff` and `seq.register`: `d` in, `q` out, on an edge. */
export function registerLike({
  type,
  title,
  shortTitle,
  icon,
  view,
  keywords,
  docs,
  hasSet,
  hasQn,
}: RegisterSpec): NodeDefinition {
  return defineNode({
    type,
    title,
    shortTitle,
    view,
    category: "seq",
    keywords,
    icon,
    docs: docs + SHARED_CLOCKED_DOCS,
    defaultParams: { width: 1, edge: "rising", asyncReset: true },
    paramsSchema: [
      widthParam(),
      EDGE_PARAM,
      {
        key: "asyncReset",
        label: "Asynchronous reset",
        kind: "bool",
        hint: "Off makes reset take effect on the clock edge instead.",
      },
    ],
    pins: (params) => {
      const width = widthOf(params);
      const controls = hasSet ? ["rst", "set", "en"] : ["rst", "en"];
      const offsets = spread(controls.length, BODY_WIDTH);

      return [
        { id: "d", name: "D", direction: "in", width, side: "left", offset: 3 },
        ...controls.map(
          (id, index): PinSpec => ({
            id,
            name: id.toUpperCase(),
            direction: "in",
            width: 1,
            side: "top",
            offset: offsets[index],
          }),
        ),
        {
          id: "clk",
          name: "CLK",
          direction: "in",
          width: 1,
          side: "bottom",
          offset: BODY_WIDTH / 2,
        },
        {
          id: "q",
          name: "Q",
          direction: "out",
          width,
          side: "right",
          offset: hasQn ? 2 : 3,
        },
        ...(hasQn
          ? [
              {
                id: "qn",
                name: "Q̅",
                direction: "out" as const,
                width,
                side: "right" as const,
                offset: 4,
              },
            ]
          : []),
      ];
    },
    size: () => ({ width: BODY_WIDTH, height: BODY_HEIGHT }),
    createState: () => ({ q: [], clk: NO_LEVEL }),
    evaluate: (ctx) => {
      const width = widthOf(ctx.params);
      const q = clocked(ctx, width, {
        hasSet,
        hasEnable: true,
        // A D flip-flop ignores what it held: the new value is whatever `d`
        // was at the edge, with a floating input normalised to X.
        nextValue: () => combine([ctx.read("d")], width, AND2),
      });

      ctx.write("q", q);
      if (hasQn) ctx.write("qn", invert(q, width));
    },
  });
}

type BitFlopSpec = {
  type: string;
  title: string;
  /** The abbreviation the canvas writes on the body — `"DFF"`, `"JKFF"`. */
  shortTitle?: string;
  /** Renderer name — `"block"` until this part is drawn as a real symbol. */
  view?: string;
  icon: string;
  keywords: readonly string[];
  /** Markdown help, rendered by the palette's info dialog. */
  docs: string;
  /** Data pin ids, left side, one bit each — `["j", "k"]` or `["t"]`. */
  inputs: readonly string[];
  /** Next `q` bit from the current one and the data pins, at the edge. */
  next: (current: LogicValue, inputs: readonly LogicValue[]) => LogicValue;
};

/**
 * `seq.jkff` and `seq.tff`: one bit, an edge, and a next-state function of
 * what is stored. Always one bit wide — a JK is a teaching part, and a
 * multi-bit one is a register with extra steps.
 */
export function bitFlop({
  type,
  title,
  shortTitle,
  icon,
  view,
  keywords,
  docs,
  inputs,
  next,
}: BitFlopSpec): NodeDefinition {
  return defineNode({
    type,
    title,
    shortTitle,
    view,
    category: "seq",
    keywords,
    icon,
    docs: docs + SHARED_CLOCKED_DOCS,
    defaultParams: { edge: "rising", asyncReset: true },
    paramsSchema: [EDGE_PARAM],
    pins: () => {
      const offsets = spread(inputs.length, BODY_HEIGHT);
      return [
        ...inputs.map(
          (id, index): PinSpec => ({
            id,
            name: id.toUpperCase(),
            direction: "in",
            width: 1,
            side: "left",
            offset: offsets[index],
          }),
        ),
        {
          id: "rst",
          name: "RST",
          direction: "in",
          width: 1,
          side: "top",
          offset: BODY_WIDTH / 2,
        },
        {
          id: "clk",
          name: "CLK",
          direction: "in",
          width: 1,
          side: "bottom",
          offset: BODY_WIDTH / 2,
        },
        {
          id: "q",
          name: "Q",
          direction: "out",
          width: 1,
          side: "right",
          offset: 2,
        },
        {
          id: "qn",
          name: "Q̅",
          direction: "out",
          width: 1,
          side: "right",
          offset: 4,
        },
      ];
    },
    size: () => ({ width: BODY_WIDTH, height: BODY_HEIGHT }),
    createState: () => ({ q: [], clk: NO_LEVEL }),
    evaluate: (ctx) => {
      const q = clocked(ctx, 1, {
        hasSet: false,
        hasEnable: false,
        nextValue: (current) =>
          fill(
            1,
            next(
              current[0] as LogicValue,
              inputs.map((id) => ctx.read(id)[0] as LogicValue),
            ),
          ),
      });

      ctx.write("q", q);
      ctx.write("qn", invert(q, 1));
    },
  });
}

/** Shared by JK and T: a toggle nobody can resolve is X, not a coin flip. */
export function toggle(current: LogicValue): LogicValue {
  return current === LOW ? HIGH : current === HIGH ? LOW : X;
}
