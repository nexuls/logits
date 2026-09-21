import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { groupSteps, type StepGroup } from "@/lib/assistant/execute";
import {
  type AssistantRequest,
  assistantResponseSchema,
  assistantStatusSchema,
  type ContextNode,
  MAX_CONTEXT_NODES,
  type PlanStep,
  type SegmentTrace,
} from "@/lib/assistant/protocol";
import type { CircuitDocument, Point } from "@/lib/circuit/schema";
import { subcircuitDefinitions } from "@/lib/circuit/subcircuit";
import { lookupNode } from "@/lib/nodes/registry";
import {
  applyAssistantSteps,
  getDocument,
  getRootDocument,
  redo,
  undo,
} from "@/state/document";
import { getSelection, selectOnly } from "@/state/selection";
import {
  pause,
  play,
  resetSimulation,
  stepSimulation,
} from "@/state/simulation";

/**
 * The chat's state and its one side effect: turning a message into edits.
 *
 * The assistant is an *optional* extra that needs the network. Nothing else
 * in the editor imports this, and every way it can fail — offline, the route
 * missing, no key on the server, Jev slow or down — ends as a line in the
 * chat, never as an exception the editor sees. With it unavailable the app is
 * exactly the local-first editor it was without it (ADR 0014).
 */

export type Availability =
  | "checking"
  | "ready"
  | "offline"
  | "unconfigured"
  | "unreachable";

export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | {
      id: number;
      role: "assistant";
      tone: "done" | "unsure" | "error";
      lines: string[];
      trace?: SegmentTrace[];
    };

/** A message before it has an id; distributes over the union, unlike `Omit`. */
type NewMessage = ChatMessage extends infer M
  ? M extends ChatMessage
    ? Omit<M, "id">
    : never
  : never;

/** The request's whole budget; the route's own deadlines fit inside it. */
const REQUEST_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 8_000;
const ENDPOINT = "/api/assistant";

export function useAssistant(getViewCenter: () => Point) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const { availability, recheck } = useAvailability();
  const nextId = useRef(0);
  /** What the last reply placed — what "them" means in the next message. */
  const recent = useRef<string[]>([]);

  const post = useCallback((message: NewMessage) => {
    const id = nextId.current++;
    setMessages((current) => [...current, { ...message, id }]);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      post({ role: "user", text });
      const document = getDocument();
      if (!document) {
        post({
          role: "assistant",
          tone: "error",
          lines: ["Open a circuit first."],
        });
        return;
      }

      setBusy(true);
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildRequest(text, document, recent.current)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const parsed = assistantResponseSchema.safeParse(
          await response.json().catch(() => null),
        );

        if (!parsed.success) {
          post({
            role: "assistant",
            tone: "error",
            lines: ["The assistant is not answering properly right now."],
          });
          recheck();
          return;
        }

        const answer = parsed.data;
        if (!answer.ok) {
          post({ role: "assistant", tone: "error", lines: [answer.message] });
          if (answer.error === "unconfigured") recheck();
          return;
        }
        if (answer.unsure.length > 0) {
          post({
            role: "assistant",
            tone: "unsure",
            lines: [...answer.unsure, "Nothing was changed."],
            trace: answer.trace,
          });
          return;
        }

        const { lines, placed, problems } = runPlan(answer.plan, getViewCenter);
        if (problems.length > 0) {
          post({
            role: "assistant",
            tone: "unsure",
            lines: [
              ...lines,
              ...problems,
              lines.length > 0
                ? "The rest was not done."
                : "Nothing was changed.",
            ],
            trace: answer.trace,
          });
          return;
        }
        recent.current = placed;
        post({
          role: "assistant",
          tone: "done",
          lines: lines.length > 0 ? lines : ["There was nothing to do."],
          trace: answer.trace,
        });
      } catch (error) {
        const timedOut =
          error instanceof DOMException && error.name === "TimeoutError";
        post({
          role: "assistant",
          tone: "error",
          lines: [
            timedOut
              ? "No answer in time. Try again, or try a shorter request."
              : "Couldn't reach the assistant. Everything else in the editor still works.",
          ],
        });
        recheck();
      } finally {
        setBusy(false);
      }
    },
    [busy, getViewCenter, post, recheck],
  );

  const clear = useCallback(() => {
    setMessages([]);
    recent.current = [];
  }, []);

  return { messages, busy, availability, send, clear, recheck };
}

/**
 * Runs a plan in order. Consecutive document steps are one edit, so a
 * "place, place, wire" is one undo; a run control or an undo in the middle
 * happens between edits, where it was asked for.
 */
function runPlan(
  plan: readonly PlanStep[],
  getViewCenter: () => Point,
): { lines: string[]; placed: string[]; problems: string[] } {
  const lines: string[] = [];
  let placed = new Map<number, string[]>();
  let selection: string[] | null = null;

  for (const group of groupSteps(plan)) {
    if (group.kind === "document") {
      const result = applyAssistantSteps(group.steps, {
        worldCenter: getViewCenter(),
        selection: getSelection().nodeIds,
        placed,
      });
      if (!result) {
        return { lines, placed: [], problems: ["No circuit is open."] };
      }
      // A group that could not be done was not applied; stop here, so
      // nothing after it runs on a canvas missing what it expected.
      if (result.problems.length > 0) {
        return { lines, placed: [], problems: result.problems };
      }
      placed = result.placed;
      lines.push(...result.notes);
      if (result.selection) selection = result.selection;
      continue;
    }

    lines.push(runControl(group.step));
  }

  if (selection) selectOnly(selection);
  return { lines, placed: [...placed.values()].flat(), problems: [] };
}

function runControl(
  step: Extract<StepGroup, { kind: "control" }>["step"],
): string {
  if (step.op === "history") {
    const done = step.action === "undo" ? undo() : redo();
    return done
      ? step.action === "undo"
        ? "Undid the last change."
        : "Redid the change."
      : `There was nothing to ${step.action}.`;
  }
  switch (step.action) {
    case "play":
      play();
      return "Started the simulation.";
    case "pause":
      pause();
      return "Paused the simulation.";
    case "step":
      stepSimulation();
      return "Stepped the simulation.";
    case "reset":
      resetSimulation();
      return "Reset the simulation.";
  }
}

/**
 * What the route is told about the canvas: element types and labels, the
 * selection, and what the last reply placed — never positions, params or
 * wiring. The selected and recent come first, so a large circuit trimmed to
 * the limit keeps the elements a request is most likely to mean.
 */
function buildRequest(
  message: string,
  document: CircuitDocument,
  recent: readonly string[],
): AssistantRequest {
  const selected = new Set(getSelection().nodeIds);
  const recentSet = new Set(recent);
  const rank = (id: string) =>
    selected.has(id) ? 0 : recentSet.has(id) ? 1 : 2;

  const nodes: ContextNode[] = Object.values(document.nodes)
    .sort((a, b) => rank(a.id) - rank(b.id))
    .slice(0, MAX_CONTEXT_NODES)
    .map((node) => ({
      id: node.id,
      type: node.type,
      ...(node.label?.trim() ? { label: node.label.trim() } : {}),
      ...(selected.has(node.id) ? { selected: true } : {}),
      ...(recentSet.has(node.id) ? { recent: true } : {}),
    }));

  const root = getRootDocument();
  const chips = root
    ? subcircuitDefinitions(root, lookupNode)
        .slice(0, 64)
        .map((definition) => ({
          type: definition.type,
          title: definition.title,
        }))
    : [];

  return { message, nodes, chips };
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * Whether the assistant can be used: the browser is online and the route
 * says a key is configured. Asked again on reconnect and after any failure,
 * so the chat recovers by itself when the network comes back.
 */
function useAvailability() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const [server, setServer] =
    useState<Exclude<Availability, "offline">>("checking");

  const recheck = useCallback(async () => {
    setServer("checking");
    try {
      const response = await fetch(ENDPOINT, {
        cache: "no-store",
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      });
      const status = assistantStatusSchema.safeParse(
        await response.json().catch(() => null),
      );
      setServer(
        !response.ok || !status.success
          ? "unreachable"
          : status.data.available
            ? "ready"
            : "unconfigured",
      );
    } catch {
      setServer("unreachable");
    }
  }, []);

  useEffect(() => {
    if (online) void recheck();
  }, [online, recheck]);

  return {
    availability: (online ? server : "offline") as Availability,
    recheck,
  };
}
