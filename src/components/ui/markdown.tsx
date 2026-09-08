"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

type Props = {
  children: string;
  className?: string;
};

/**
 * Markdown, rendered with the app's own tokens rather than a prose theme.
 *
 * The element map is here and not per call site so every bit of authored
 * Markdown in the app — node help today, anything else later — reads the same,
 * and so no caller has to know which remark plugins are on. GFM is on for
 * tables: pin lists and truth tables are most of what node docs contain.
 */
const components: Components = {
  h1: ({ className, ...props }) => (
    <h2
      className={cn("mt-6 mb-2 text-xl font-semibold first:mt-0", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h3
      className={cn("mt-6 mb-2 text-lg font-semibold first:mt-0", className)}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h4
      className={cn(
        "mt-4 mb-1.5 text-lg font-semibold tracking-wide text-muted-foreground uppercase first:mt-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn("my-2 leading-relaxed first:mt-0", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("leading-relaxed", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "my-3 border-l-2 border-border pl-3 text-muted-foreground italic",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-4 border-border", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "font-medium text-primary underline underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  code: ({ className, ...props }) => (
    <code
      className={cn(
        "font-mono text-[0.85em]",
        // A fenced block carries a `language-*` class from remark and sits
        // inside `pre`, which already has the padding and background; only a
        // bare inline span needs its own.
        className?.includes("language-")
          ? className
          : "rounded-lg bg-muted px-1 py-0.5 text-foreground",
      )}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "my-3 overflow-x-auto rounded-xl bg-muted p-3 font-mono text-xs leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  // Tables scroll inside their own box: a wide truth table must not widen the
  // dialog, which is sized to the prose column.
  table: ({ className, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-xl border border-border">
      <table
        className={cn("w-full border-collapse text-xs", className)}
        {...props}
      />
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead className={cn("bg-muted/60", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border-b border-border px-2.5 py-1.5 text-left font-semibold whitespace-nowrap",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "border-b border-border/60 px-2.5 py-1.5 align-top",
        className,
      )}
      {...props}
    />
  ),
};

export function Markdown({ children, className }: Props) {
  return (
    <div className={cn("text-base text-muted-foreground", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
