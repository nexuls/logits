import {
  ArrowUpIcon,
  ChevronRightIcon,
  RefreshCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { MAX_MESSAGE_LENGTH } from "@/lib/assistant/protocol";
import type { Point } from "@/lib/circuit/schema";
import { cn } from "@/lib/utils";
import {
  type Availability,
  type ChatMessage,
  useAssistant,
} from "./use-assistant";

type Props = {
  /** Where the user is looking, in world coordinates — where new parts go. */
  getViewCenter: () => Point;
};

const EXAMPLES = [
  "Place a 16x16 matrix display, a 16x16 draw pad, and connect the pins",
  "Add a clock and a 4-bit counter and wire them",
  "Make the selected gate 3 inputs wide",
  "Start the simulation",
];

/** What the chat says when it cannot be used, and why. Never an error the editor sees. */
const STATUS_TEXT: Record<Exclude<Availability, "ready">, string> = {
  checking: "Connecting to Jev…",
  offline:
    "You're offline. The assistant needs the internet; everything else works as usual.",
  unconfigured:
    "The assistant isn't set up on this server (no TypeSafe API key).",
  unreachable:
    "Can't reach the assistant right now. Everything else works as usual.",
};

/**
 * The assistant chat, docked under the element palette.
 *
 * Typed requests go to Jev, TypeSafe's System One model, which reads them
 * into a plan of ordinary editor commands; each reply lists what was done, or
 * why nothing was. Everything it changes is one undo step, like an edit made
 * by hand. It is a text box on purpose: a voice transcript is just another
 * string for `send`.
 */
export default function AssistantPanel({ getViewCenter }: Props) {
  const { messages, busy, availability, send, clear, recheck } =
    useAssistant(getViewCenter);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const ready = availability === "ready";

  // Follow the conversation. Keyed on the count, so reading back up through
  // old replies is not yanked down by a re-render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the count is the trigger
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages.length, busy]);

  const submit = () => {
    if (!ready || busy || !draft.trim()) return;
    void send(draft);
    setDraft("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-tour="assistant"
      className="group/assistant flex shrink-0 flex-col border-t border-sidebar-border group-data-[collapsible=icon]:hidden"
    >
      <div className="flex items-center gap-1 px-2 py-1.5">
        <CollapsibleTrigger
          render={
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-[11px] font-semibold tracking-wide text-sidebar-foreground/70 uppercase hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          }
        >
          <SparklesIcon aria-hidden className="size-3.5" />
          Assistant
          <StatusDot availability={availability} />
          <ChevronRightIcon
            aria-hidden
            className="ml-auto size-4 text-sidebar-foreground/50 transition-transform duration-200 group-data-open/assistant:rotate-90"
          />
        </CollapsibleTrigger>
        {messages.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={clear}
            aria-label="Clear the conversation"
            title="Clear the conversation"
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

      <CollapsibleContent className="flex flex-col gap-2 px-2 pb-2">
        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation with the assistant"
          className="flex h-64 flex-col gap-2 overflow-y-auto overscroll-contain rounded-md bg-sidebar-accent/40 p-2"
        >
          {messages.length === 0 ? (
            <Welcome
              disabled={!ready}
              onPick={(example) => setDraft(example)}
            />
          ) : (
            messages.map((message) => (
              <ChatBubble key={message.id} message={message} />
            ))
          )}
          {busy && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> Jev is reading that…
            </p>
          )}
        </div>

        {!ready && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <p className="flex-1">{STATUS_TEXT[availability]}</p>
            {(availability === "unreachable" ||
              availability === "unconfigured") && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => void recheck()}
                aria-label="Check again"
                title="Check again"
              >
                <RefreshCwIcon />
              </Button>
            )}
          </div>
        )}

        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Ask the assistant
          </label>
          <Textarea
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={2}
            disabled={!ready}
            placeholder={
              ready ? "Tell Jev what to build…" : "Assistant unavailable"
            }
            className="min-h-16 resize-none bg-background pr-10 text-sm"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!ready || busy || draft.trim().length === 0}
            aria-label="Send"
            className="absolute right-1.5 bottom-1.5"
          >
            <ArrowUpIcon />
          </Button>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A dot for the status, with the words beside it for anyone not reading colour. */
function StatusDot({ availability }: { availability: Availability }) {
  const label =
    availability === "ready"
      ? "online"
      : availability === "checking"
        ? "connecting"
        : "unavailable";
  return (
    <span className="flex items-center gap-1 font-normal tracking-normal normal-case">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          availability === "ready"
            ? "bg-[var(--logit-led-green)]"
            : availability === "checking"
              ? "bg-muted-foreground"
              : "bg-destructive",
        )}
      />
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </span>
  );
}

function Welcome({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (example: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 text-xs text-muted-foreground">
      <p>
        Ask Jev to place, wire, change, rotate or delete elements, or to run the
        simulation. Each request is one undo.
      </p>
      <ul className="flex flex-col gap-1">
        {EXAMPLES.map((example) => (
          <li key={example}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(example)}
              className="w-full rounded-md border border-sidebar-border bg-background px-2 py-1 text-left text-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
            >
              {example}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <Bubble align="end" className="max-w-[90%]">
        <BubbleContent className="rounded-2xl px-2.5 py-1.5 text-xs">
          {message.text}
        </BubbleContent>
      </Bubble>
    );
  }

  return (
    <Bubble
      variant={message.tone === "error" ? "destructive" : "outline"}
      className="max-w-[95%]"
    >
      <BubbleContent className="flex flex-col gap-1 rounded-2xl px-2.5 py-1.5 text-xs">
        {message.tone === "unsure" && (
          <span className="font-medium text-muted-foreground">Not sure:</span>
        )}
        {message.lines.map((line, index) => (
          // Lines are regenerated only with the message, never reordered.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <p key={index}>{line}</p>
        ))}
        {message.trace && message.trace.length > 0 && (
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer select-none">
              How Jev read it
            </summary>
            <ul className="mt-1 flex flex-col gap-1">
              {message.trace.map((segment, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are fixed per reply
                <li key={index}>
                  <span className="text-foreground">“{segment.text}”</span>
                  <ul className="pl-2">
                    {segment.judgments.map((judgment, at) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: a question can repeat, once per end of a wire
                      <li key={at}>
                        {judgment.question}: {judgment.answer}{" "}
                        <span className="tabular-nums">
                          ({Math.round(judgment.confidence * 100)}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </details>
        )}
      </BubbleContent>
    </Bubble>
  );
}
