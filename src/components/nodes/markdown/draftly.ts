import DOMPurify from "dompurify";
import {
  createTheme,
  DraftlyPlugin,
  ThemeEnum,
} from "draftly/src/editor/index.ts";
import { HeadingPlugin } from "draftly/src/plugins/heading-plugin.ts";
import { HRPlugin } from "draftly/src/plugins/hr-plugin.ts";
import { InlinePlugin } from "draftly/src/plugins/inline-plugin.ts";
import { LinkPlugin } from "draftly/src/plugins/link-plugin.ts";
import { ListPlugin } from "draftly/src/plugins/list-plugin.ts";
import { ParagraphPlugin } from "draftly/src/plugins/paragraph-plugin.ts";
import { QuotePlugin } from "draftly/src/plugins/quote-plugin.ts";
import {
  escapeHtml,
  generateCSS,
  type PreviewContext,
  preview,
} from "draftly/src/preview/index.ts";

/**
 * The draftly setup a note on the canvas uses, shared by its editor and its
 * preview so the two agree on what the text means.
 *
 * Imported from draftly's TypeScript sources one plugin at a time, not from
 * `draftly/plugins`: that bundle statically imports mermaid, KaTeX and
 * node-emoji — plus a Vite-only `?raw` stylesheet — for plugins a note never
 * uses. That is why `tsconfig.json` allows `.ts` import paths.
 *
 * Deliberately the everyday subset: paragraphs, headings, emphasis, links,
 * lists, quotes and rules. No tables, images, raw HTML, math, diagrams or code
 * highlighting — a note must never fetch or run anything, and it is a note,
 * not a document.
 */

/** Fresh instances per editor: a plugin keeps the view it is registered on. */
export function notePlugins(): DraftlyPlugin[] {
  return [
    new ParagraphPlugin(),
    new HeadingPlugin(),
    new InlinePlugin(),
    new LinkPlugin(),
    new ListPlugin(),
    new QuotePlugin(),
    new HRPlugin(),
  ];
}

/**
 * What the preview does with the syntax the chosen plugins leave alone.
 *
 * Without a plugin, draftly's renderer writes a leaf node's source straight
 * into the HTML, unescaped — so `<img src=…>` typed into a note would load.
 * This claims those nodes: code is shown as code, an image as its alt text, an
 * autolink as a link, and HTML as the text it was typed as. The sanitizer
 * below is the second line, not the only one.
 */
class CanvasSafePlugin extends DraftlyPlugin {
  readonly name = "logits-canvas-safe";
  readonly version = "1.0.0";
  readonly requiredNodes = [
    "InlineCode",
    "FencedCode",
    "CodeBlock",
    "Image",
    "Autolink",
    "Escape",
    "HTMLBlock",
    "HTMLTag",
    "Comment",
    "CommentBlock",
    "ProcessingInstructionBlock",
  ] as const;

  override renderToHTML(
    node: { name: string; from: number; to: number },
    _children: string,
    ctx: PreviewContext,
  ): string | null {
    const source = ctx.sliceDoc(node.from, node.to);

    switch (node.name) {
      case "InlineCode": {
        const code = source.replace(/^(`+)([\s\S]*?)\1$/, "$2");
        return `<code>${escapeHtml(code)}</code>`;
      }
      case "FencedCode": {
        const lines = source.split("\n").slice(1);
        if (/^\s*(`{3,}|~{3,})\s*$/.test(lines.at(-1) ?? "")) lines.pop();
        return `<pre><code>${escapeHtml(lines.join("\n"))}</code></pre>`;
      }
      case "CodeBlock":
        return `<pre><code>${escapeHtml(source.replace(/^( {4}|\t)/gm, ""))}</code></pre>`;
      case "Image": {
        const alt = /^!\[([^\]]*)\]/.exec(source)?.[1] ?? "";
        return `<span class="logit-note-alt">${escapeHtml(alt)}</span>`;
      }
      case "Autolink": {
        const url = escapeHtml(source.slice(1, -1));
        return `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`;
      }
      case "Escape":
        return escapeHtml(source.slice(1));
      case "HTMLBlock":
      case "CommentBlock":
      case "ProcessingInstructionBlock":
        return `<p class="logit-note-raw">${escapeHtml(source)}</p>`;
      default:
        return escapeHtml(source);
    }
  }
}

/**
 * Everything the preview may emit. No `img`, `style`, `iframe` or event
 * attribute is on it, so whatever slips past the renderer still cannot fetch
 * or run anything; DOMPurify also drops `javascript:` links on its own.
 */
const ALLOWED_TAGS = [
  "article",
  "section",
  "div",
  "span",
  "p",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "em",
  "del",
  "s",
  "sub",
  "sup",
  "mark",
  "a",
  "ul",
  "ol",
  "li",
  "input",
  "blockquote",
  "hr",
  "code",
  "pre",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
];
const ALLOWED_ATTR = [
  "class",
  "href",
  "title",
  "target",
  "rel",
  "type",
  "checked",
  "disabled",
];

/** The editor's plugins, plus the fallbacks only a rendered preview needs. */
export function previewPlugins(): DraftlyPlugin[] {
  // The style plugin last, so its rules follow draftly's in the generated CSS.
  return [...notePlugins(), new CanvasSafePlugin(), new NoteStylePlugin()];
}

/**
 * How a note looks, as a draftly theme on draftly's own classes — the one
 * form both halves consume: the editor mounts it as a CodeMirror theme and
 * `generateCSS` turns it into the preview's stylesheet, so typing and reading
 * a note look the same. Sizes in `em` so a note scales with its Font size;
 * colours from `currentColor` and the app's tokens so both themes read.
 */
export const noteTheme = createTheme({
  default: {
    // One key per heading: draftly flattens a theme into an object keyed by
    // selector, so a class named in two keys keeps only the later one.
    ".cm-draftly-h1": {
      fontFamily: "inherit",
      fontSize: "1.6em",
      fontWeight: "700",
      lineHeight: "1.25",
    },
    ".cm-draftly-h2": {
      fontFamily: "inherit",
      fontSize: "1.3em",
      fontWeight: "600",
      lineHeight: "1.25",
    },
    ".cm-draftly-h3": {
      fontFamily: "inherit",
      fontSize: "1.12em",
      fontWeight: "600",
      lineHeight: "1.25",
    },
    ".cm-draftly-h4": {
      fontFamily: "inherit",
      fontSize: "1em",
      fontWeight: "600",
      lineHeight: "1.25",
    },
    ".cm-draftly-h5": {
      fontFamily: "inherit",
      fontSize: "1em",
      fontWeight: "600",
      lineHeight: "1.25",
    },
    ".cm-draftly-h6": {
      fontFamily: "inherit",
      fontSize: "1em",
      fontWeight: "600",
      lineHeight: "1.25",
    },
    ".cm-draftly-line-h1, .cm-draftly-line-h2, .cm-draftly-line-h3, .cm-draftly-line-h4, .cm-draftly-line-h5, .cm-draftly-line-h6":
      {
        paddingTop: "0.5em",
        paddingBottom: "0.25em",
      },
    ".cm-draftly-paragraph": { paddingTop: "0em", paddingBottom: "0em" },
    ".cm-draftly-preview": { paddingLeft: "1.3em", margin: "0.35em 0" },
    ".draftly-preview ul, .cm-draftly-preview ol": {
      margin: "0",
      padding: "0",
      listStylePosition: "inside",
    },
    ".draftly-preview li": { marginBottom: "0" },
    ".draftly-preview li > *": { display: "inline-block" },
    ".cm-draftly-quote-line": {
      borderLeft:
        "0.2em solid color-mix(in oklch, currentColor 30%, transparent)",
      paddingLeft: "0.6em !important",
      marginLeft: "0",
      opacity: "0.8",
    },
    ".cm-draftly-quote-content": { fontStyle: "normal" },
    ".cm-draftly-hr-line": { paddingTop: "0.5em", paddingBottom: "0.5em" },
    ".cm-draftly-hr-line::after": { height: "1px", opacity: "0.25" },
    ".cm-draftly-link, .cm-draftly-link-styled, .cm-draftly-link-text": {
      color: "var(--primary)",
      textUnderlineOffset: "2px",
    },
    ".cm-draftly-link:hover, .cm-draftly-link-styled:hover": {
      color: "var(--primary)",
    },
    ".cm-draftly-strong": { fontWeight: "700" },
    ".cm-draftly-highlight": {
      padding: "0",
      borderRadius: "0.2em",
      backgroundColor:
        "color-mix(in oklch, var(--logit-tint-amber) 35%, transparent)",
    },
    // A note is often a few lines tall: its first and last blocks sit flush
    // with the box instead of spending a line on padding.
    ".cm-draftly-line-h1:first-child, .cm-draftly-line-h2:first-child, .cm-draftly-line-h3:first-child, .cm-draftly-line-h4:first-child, .cm-draftly-line-h5:first-child, .cm-draftly-line-h6:first-child, .cm-draftly-paragraph:first-child":
      {
        paddingTop: "0",
      },
    ".cm-draftly-line-h1:last-child, .cm-draftly-line-h2:last-child, .cm-draftly-line-h3:last-child, .cm-draftly-line-h4:last-child, .cm-draftly-line-h5:last-child, .cm-draftly-line-h6:last-child, .cm-draftly-paragraph:last-child":
      {
        paddingBottom: "0",
      },
  },
});

/** Carries `noteTheme` into `generateCSS`; it renders nothing itself. */
class NoteStylePlugin extends DraftlyPlugin {
  readonly name = "logits-note-style";
  readonly version = "1.0.0";

  override get theme() {
    return noteTheme;
  }
}

/** Rendering keeps no per-document state in the plugins, so one set serves. */
let sharedPreviewPlugins: DraftlyPlugin[] | undefined;

/** Where the preview HTML lives; draftly's generated CSS is scoped to it. */
export const NOTE_PREVIEW_CLASS = "logit-note";

const STYLE_ID = "logit-note-draftly-styles";

/**
 * draftly's own preview CSS for the plugins in use, added to the page once.
 *
 * Generated twice: light scoped to the note, dark scoped under `.dark`, which
 * is how the app themes (draftly's AUTO would follow the media query instead).
 * The dark rules are more specific, so they win while the class is on. No base
 * styles — the note's box already has its own padding.
 */
function installPreviewStyles(plugins: DraftlyPlugin[]) {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) {
    return;
  }
  const light = generateCSS({
    plugins,
    theme: ThemeEnum.LIGHT,
    wrapperClass: NOTE_PREVIEW_CLASS,
    includeBase: false,
  });
  const dark = generateCSS({
    plugins,
    theme: ThemeEnum.DARK,
    wrapperClass: `dark .${NOTE_PREVIEW_CLASS}`,
    includeBase: false,
  });

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `${light}\n\n${dark}`;
  document.head.append(style);
}

export async function renderNoteMarkdown(markdown: string): Promise<string> {
  sharedPreviewPlugins ??= previewPlugins();
  installPreviewStyles(sharedPreviewPlugins);
  const html = await preview(markdown, {
    plugins: sharedPreviewPlugins,
    theme: ThemeEnum.AUTO,
  });
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
