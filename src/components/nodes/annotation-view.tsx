"use client";

import { CheckIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import {
  MAX_TEXT_LENGTH,
  textAlign,
  textContent,
  textFontSize,
  textFormat,
} from "@/lib/nodes/deco/text";
import { colorParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import { NOTE_PREVIEW_CLASS } from "./markdown/draftly";
import { useNoteHtml } from "./markdown/note-html";
import type { NodeViewProps } from "./node-views";

// Loaded when the first editing session opens, so the canvas does not ship
// CodeMirror to someone who never edits a note.
const NoteEditor = dynamic(() => import("./markdown/note-editor"), {
  ssr: false,
});

/**
 * Text on the canvas, plain or Markdown, at the font size the user set.
 *
 * At rest a Markdown note is static HTML, rendered once through draftly and
 * cached against its text (`note-html.ts`), so a board of notes costs DOM and
 * nothing else. Editing swaps in CodeMirror with draftly's live styling for the
 * length of the session, and drops it again when the session ends.
 *
 * The preview wears draftly's own generated CSS (`markdown/draftly.ts`), whose
 * sizes are in `em`, so it scales with the box's own font size. Raw HTML is shown as text and an image
 * as its alt text, so a note can never fetch anything.
 */
export default function AnnotationView({
  node,
  def,
  editing,
  onEditEnd,
  setParams,
}: NodeViewProps) {
  const text = textContent(node.params);
  const markdown = textFormat(node.params) === "markdown";
  const ink = colorParam(def, node.params, "color") ?? "var(--foreground)";
  const wash = colorParam(def, node.params, "background");
  const tinted = wash !== undefined && wash !== "transparent";

  const html = useNoteHtml(markdown && !editing ? text : null);

  return (
    <div
      className={cn(
        "absolute inset-0 rounded-md break-words",
        tinted ? "border px-[0.6em] py-[0.4em]" : "px-[0.1em]",
        // The confirm button hangs just below the box while editing.
        editing ? "overflow-visible" : "overflow-hidden",
        !markdown && !editing && "whitespace-pre-wrap",
      )}
      style={{
        fontSize: textFontSize(node.params),
        lineHeight: 1.4,
        textAlign: textAlign(node.params),
        // Pulled a little toward the foreground so a tint used as ink keeps
        // its contrast on either theme; the neutral options are unchanged.
        color: `color-mix(in oklch, ${ink} 80%, var(--foreground))`,
        background: tinted
          ? `color-mix(in oklch, ${wash} 16%, var(--card))`
          : undefined,
        borderColor: tinted
          ? `color-mix(in oklch, ${wash} 45%, transparent)`
          : undefined,
      }}
    >
      {editing ? (
        <EditSession
          text={text}
          markdown={markdown}
          label={`${def.title} text`}
          onCommit={(value) => setParams({ text: value })}
          onEnd={onEditEnd}
        />
      ) : markdown ? (
        html !== undefined && <NoteHtml html={html} />
      ) : (
        text
      )}
    </div>
  );
}

function NoteHtml({ html }: { html: string }) {
  return (
    <div
      className={NOTE_PREVIEW_CLASS}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized against an allow-list with no images, styles or event attributes in markdown/draftly.ts.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

const CONTAINED_EVENTS = ["pointerdown", "dblclick", "keydown", "keyup"];

type SessionProps = {
  text: string;
  markdown: boolean;
  label: string;
  onCommit: (text: string) => void;
  onEnd: () => void;
};

/**
 * One editing session: the editor, a confirm button under the box, and the
 * rules for when it ends. The text reaches the document once, through one
 * `setParams`, so a session is one undo step however long the typing was.
 */
function EditSession({ text, markdown, label, onCommit, onEnd }: SessionProps) {
  const surface = useRef<HTMLDivElement>(null);
  const typed = useRef(text);
  const committed = useRef(text);
  const handlers = useRef({ onCommit, onEnd });
  handlers.current = { onCommit, onEnd };

  // Safe to call more than once: the button, Esc, an outside press and the
  // unmount can all follow one another for the same edit.
  const commit = useCallback(() => {
    if (typed.current === committed.current) return;
    committed.current = typed.current;
    handlers.current.onCommit(typed.current);
  }, []);

  const finish = useCallback(() => {
    commit();
    handlers.current.onEnd();
  }, [commit]);

  // A press anywhere outside the note confirms it. On the window, captured,
  // like `io.keyboard`: the canvas takes presses without taking focus, so a
  // blur alone would miss a click on empty canvas.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        surface.current?.contains(event.target)
      ) {
        return;
      }
      finish();
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, [finish]);

  // Inside the editor a press places the caret, Delete and Ctrl+Z edit the
  // text and the wheel scrolls it — so none of those may reach the canvas,
  // which would drag the note, zoom, or run the editor shortcuts on the
  // window. Stopped natively, as `io.keyboard` does, before React's root
  // listener sees them. The wheel scrolls by hand because the viewport cancels
  // native wheel scrolling to own zoom and pan.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;

    const contain = (event: Event) => event.stopPropagation();
    const onWheel = (event: WheelEvent) => {
      event.stopPropagation();
      element
        .querySelector(".cm-scroller")
        ?.scrollBy(event.deltaX, event.deltaY);
    };

    for (const kind of CONTAINED_EVENTS) {
      element.addEventListener(kind, contain);
    }
    element.addEventListener("wheel", onWheel);
    return () => {
      for (const kind of CONTAINED_EVENTS) {
        element.removeEventListener(kind, contain);
      }
      element.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Unmount commits but does not end the session: a note undone away mid-edit
  // keeps what was typed, and ending here would also close the editor under
  // React's development double-mount. The editor ends a vanished note's
  // session itself.
  useEffect(() => commit, [commit]);

  return (
    <div ref={surface} className="h-full">
      <NoteEditor
        initial={text}
        markdown={markdown}
        maxLength={MAX_TEXT_LENGTH}
        label={label}
        onChange={(value) => {
          typed.current = value;
        }}
        onDone={finish}
      />
      <button
        type="button"
        onClick={finish}
        aria-label="Confirm edit"
        title="Confirm — or click outside, or press Esc"
        className="absolute top-full left-1/2 -translate-x-1/2 mt-1 flex px-1 py-0.5 items-center justify-center rounded-md border border-border bg-popover text-popover-foreground shadow-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CheckIcon className="size-2" />
        <span className="text-[0.5rem] ml-1">Confirm</span>
      </button>
    </div>
  );
}
