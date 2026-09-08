import type { PinSpec } from "@/lib/circuit/schema";
import {
  boolParam,
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
  icon: string;
  keywords: readonly string[];
  /** `seq.dff` has `set` and `qn`; `seq.register` has neither. */
  hasSet: boolean;
  hasQn: boolean;
};

/** `seq.dff` and `seq.register`: `d` in, `q` out, on an edge. */
export function registerLike({
  type,
  title,
  icon,
  keywords,
  hasSet,
  hasQn,
}: RegisterSpec): NodeDefinition {
  return {
    type,
    title,
    category: "seq",
    keywords,
    icon,
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
  };
}

type BitFlopSpec = {
  type: string;
  title: string;
  icon: string;
  keywords: readonly string[];
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
  icon,
  keywords,
  inputs,
  next,
}: BitFlopSpec): NodeDefinition {
  return {
    type,
    title,
    category: "seq",
    keywords,
    icon,
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
  };
}

/** Shared by JK and T: a toggle nobody can resolve is X, not a coin flip. */
export function toggle(current: LogicValue): LogicValue {
  return current === LOW ? HIGH : current === HIGH ? LOW : X;
}
