"use client";

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  textAlign,
  textContent,
  textFontSize,
  textFormat,
} from "@/lib/nodes/deco/text";
import { colorParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";

/**
 * Text on the canvas, plain or Markdown, at the font size the user set.
 *
 * Not `ui/markdown.tsx`: that one is sized for a help dialog in rem, and this
 * has to scale with the box's own font size, so every size and gap here is in
 * `em`. The subset is deliberately the everyday one — headings, emphasis,
 * lists, quotes, code, links, tables. Raw HTML is skipped rather than run, and
 * an image is shown as its alt text, so a note can never fetch anything.
 */
export default function AnnotationView({ node, def }: NodeViewProps) {
  const text = textContent(node.params);
  const markdown = textFormat(node.params) === "markdown";
  const ink = colorParam(def, node.params, "color") ?? "var(--foreground)";
  const wash = colorParam(def, node.params, "background");
  const tinted = wash !== undefined && wash !== "transparent";

  const body = useMemo(
    () =>
      markdown ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={COMPONENTS}
          skipHtml
        >
          {text}
        </ReactMarkdown>
      ) : (
        text
      ),
    [markdown, text],
  );

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden rounded-md break-words",
        tinted ? "border px-[0.6em] py-[0.4em]" : "px-[0.1em]",
        !markdown && "whitespace-pre-wrap",
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
      {body}
    </div>
  );
}

const COMPONENTS: Components = {
  h1: ({ node: _, ...props }) => (
    <h1
      className="mt-[0.5em] mb-[0.25em] text-[1.6em] leading-tight font-bold first:mt-0"
      {...props}
    />
  ),
  h2: ({ node: _, ...props }) => (
    <h2
      className="mt-[0.5em] mb-[0.25em] text-[1.3em] leading-tight font-semibold first:mt-0"
      {...props}
    />
  ),
  h3: ({ node: _, ...props }) => (
    <h3
      className="mt-[0.5em] mb-[0.2em] text-[1.12em] leading-snug font-semibold first:mt-0"
      {...props}
    />
  ),
  h4: ({ node: _, ...props }) => (
    <h4 className="mt-[0.4em] font-semibold first:mt-0" {...props} />
  ),
  h5: ({ node: _, ...props }) => (
    <h5 className="mt-[0.4em] font-semibold first:mt-0" {...props} />
  ),
  h6: ({ node: _, ...props }) => (
    <h6 className="mt-[0.4em] font-semibold first:mt-0" {...props} />
  ),
  p: ({ node: _, ...props }) => (
    <p className="my-[0.35em] first:mt-0 last:mb-0" {...props} />
  ),
  ul: ({ node: _, ...props }) => (
    <ul
      className="my-[0.35em] list-disc pl-[1.3em] first:mt-0 last:mb-0"
      {...props}
    />
  ),
  ol: ({ node: _, ...props }) => (
    <ol
      className="my-[0.35em] list-decimal pl-[1.4em] first:mt-0 last:mb-0"
      {...props}
    />
  ),
  blockquote: ({ node: _, ...props }) => (
    <blockquote
      className="my-[0.4em] border-l-[0.2em] border-current/30 pl-[0.6em] opacity-80"
      {...props}
    />
  ),
  hr: ({ node: _, ...props }) => (
    <hr className="my-[0.5em] border-current/25" {...props} />
  ),
  a: ({ node: _, ...props }) => (
    <a
      className="text-primary underline underline-offset-2"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  code: ({ node: _, className, ...props }) => (
    <code
      className={cn(
        "font-mono text-[0.9em]",
        // A fenced block sits in `pre`, which has the background already.
        !className?.includes("language-") &&
          "rounded-[0.25em] bg-muted/70 px-[0.3em]",
      )}
      {...props}
    />
  ),
  pre: ({ node: _, ...props }) => (
    <pre
      className="my-[0.4em] overflow-hidden rounded-[0.4em] bg-muted/70 p-[0.5em] text-[0.9em] whitespace-pre-wrap"
      {...props}
    />
  ),
  table: ({ node: _, ...props }) => (
    <table
      className="my-[0.4em] border-collapse text-[0.9em] first:mt-0"
      {...props}
    />
  ),
  th: ({ node: _, ...props }) => (
    <th
      className="border border-current/20 px-[0.4em] py-[0.15em] text-left font-semibold"
      {...props}
    />
  ),
  td: ({ node: _, ...props }) => (
    <td
      className="border border-current/20 px-[0.4em] py-[0.15em]"
      {...props}
    />
  ),
  img: ({ alt }) => <span className="italic opacity-70">{alt}</span>,
};
