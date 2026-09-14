"use client";

import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { draftly, ThemeEnum } from "draftly/src/editor/index.ts";
import { useEffect, useRef } from "react";
import { notePlugins, noteTheme } from "./draftly";

type Props = {
  initial: string;
  /** Markdown gets draftly's live decorations; plain text is edited as-is. */
  markdown: boolean;
  maxLength: number;
  label: string;
  /** Every change, so the caller can commit from outside the editor. */
  onChange: (text: string) => void;
  /** Esc or Mod-Enter: the keyboard's way to finish. */
  onDone: () => void;
};

/**
 * CodeMirror with draftly, mounted for the length of one editing session and
 * destroyed after it — a board of notes holds one editor at most, not one per
 * note. Loaded on demand by the view, so the canvas does not ship CodeMirror.
 *
 * Uncontrolled: it owns the text until the session ends, and the props are
 * read once at mount. The caller commits what `onChange` last reported.
 */
export default function NoteEditor({
  initial,
  markdown,
  maxLength,
  label,
  onChange,
  onDone,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const setup = useRef({ initial, markdown, maxLength, label });
  const handlers = useRef({ onChange, onDone });
  handlers.current = { onChange, onDone };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const { initial, markdown, maxLength, label } = setup.current;
    // Picked when the session opens; the app's theme is the `dark` class, not
    // the media query draftly's AUTO would follow.
    const theme = document.documentElement.classList.contains("dark")
      ? ThemeEnum.DARK
      : ThemeEnum.LIGHT;
    const done = () => {
      handlers.current.onDone();
      return true;
    };

    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initial,
        selection: { anchor: initial.length },
        extensions: [
          draftly({
            theme,
            plugins: markdown ? notePlugins() : [],
            disableViewPlugin: !markdown,
            highlightActiveLine: false,
            lineWrapping: true,
          }),
          // Ahead of draftly's own bindings, so neither key is swallowed.
          Prec.highest(
            keymap.of([
              { key: "Escape", run: done },
              { key: "Mod-Enter", run: done },
            ]),
          ),
          EditorState.changeFilter.of(
            (transaction) => transaction.newDoc.length <= maxLength,
          ),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              handlers.current.onChange(update.state.doc.toString());
            }
          }),
          EditorView.contentAttributes.of({ "aria-label": label }),
          // The same look the preview's generated CSS carries, over draftly's
          // defaults, so the note does not change style when it is committed.
          Prec.highest([EditorView.theme(noteTheme(theme)), FIT_THE_NOTE]),
        ],
      }),
    });
    view.focus();

    return () => view.destroy();
  }, []);

  return <div ref={host} className="h-full w-full cursor-text" />;
}

/**
 * draftly styles a page-width editor at 16px. A note is neither, so the
 * editor takes the box, font, size, colour and alignment the note already has
 * — which is also what makes the editor and the preview line up.
 */
const FIT_THE_NOTE = EditorView.theme({
  "&, &.cm-draftly": {
    height: "100%",
    fontSize: "inherit",
    lineHeight: "inherit",
    color: "inherit",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflow: "auto",
  },
  "&.cm-draftly .cm-content, .cm-content": {
    maxWidth: "none",
    margin: "0",
    padding: "0",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    caretColor: "currentColor",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "currentColor" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    {
      backgroundColor:
        "color-mix(in oklch, var(--primary) 30%, transparent) !important",
    },
});
