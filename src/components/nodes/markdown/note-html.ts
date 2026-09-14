import { useEffect, useState } from "react";

/**
 * A note's Markdown as HTML, rendered once per distinct text and kept.
 *
 * Rendering parses the whole text, and the canvas re-renders a note on every
 * move, select and zoom — none of which change what it says. So the HTML is
 * cached against the exact text: the second note saying the same thing, the
 * same note after an undo, and every re-render in between cost a map lookup.
 *
 * draftly is imported on the first render, not with the canvas, so a circuit
 * with no notes never loads it.
 */

/** Plenty for every note on a big board; oldest-rendered goes first past it. */
const MAX_ENTRIES = 256;

const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

export function renderNoteHtml(markdown: string): Promise<string> {
  const hit = cache.get(markdown);
  if (hit !== undefined) return Promise.resolve(hit);

  let job = pending.get(markdown);
  if (!job) {
    job = import("./draftly")
      .then(({ renderNoteMarkdown }) => renderNoteMarkdown(markdown))
      // A note that cannot be rendered still says what it says.
      .catch(() => `<p class="logit-note-raw">${escapeText(markdown)}</p>`)
      .then((html) => {
        cache.set(markdown, html);
        if (cache.size > MAX_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        return html;
      })
      .finally(() => pending.delete(markdown));
    pending.set(markdown, job);
  }
  return job;
}

/**
 * The HTML for `markdown`, or undefined until the first render of it lands.
 * While a changed text is rendering it keeps returning the previous HTML, so
 * committing an edit does not blank the note for a frame. `null` renders
 * nothing — the note is being edited, or is plain text.
 */
export function useNoteHtml(markdown: string | null): string | undefined {
  const [latest, setLatest] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (markdown === null || cache.has(markdown)) return;
    let live = true;
    renderNoteHtml(markdown).then((html) => {
      if (live) setLatest(html);
    });
    return () => {
      live = false;
    };
  }, [markdown]);

  return (markdown === null ? undefined : cache.get(markdown)) ?? latest;
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
