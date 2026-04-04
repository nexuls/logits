import { EditorView } from "@codemirror/view";

/**
 * Base theme for draftly styling
 * Note: Layout styles are scoped under .cm-draftly which is added by the view plugin
 */
export const draftlyBaseTheme = EditorView.theme({
  // Container styles - only apply when view plugin is enabled
  "&.cm-draftly": {
    fontFamily: "var(--user-text-font)",
    fontSize: "var(--text-base)",
    lineHeight: "1.6",
    color: "var(--color-foreground)",
    backgroundColor: "transparent !important",

    "--draftly-color-link": "var(--color-primary)",
    "--draftly-color-link-hover":
      "color-mix(in oklch, var(--color-primary) 80%, var(--color-foreground))",
    "--draftly-color-muted": "var(--color-muted-foreground)",
    "--draftly-color-success":
      "color-mix(in oklch, var(--color-chart-2) 78%, var(--color-foreground))",
    "--draftly-color-success-strong": "var(--color-chart-2)",
    "--draftly-color-danger": "var(--color-destructive)",
    "--draftly-color-danger-strong":
      "color-mix(in oklch, var(--color-destructive) 85%, white)",
    "--draftly-color-warning": "var(--color-chart-2)",
    "--draftly-color-warning-strong":
      "color-mix(in oklch, var(--color-chart-2) 82%, var(--color-foreground))",
    "--draftly-color-tooltip-bg": "var(--color-popover)",
    "--draftly-color-tooltip-fg": "var(--color-popover-foreground)",
    "--draftly-surface-1":
      "color-mix(in oklch, var(--color-foreground) 3%, transparent)",
    "--draftly-surface-2":
      "color-mix(in oklch, var(--color-muted) 50%, transparent)",
    "--draftly-surface-3":
      "color-mix(in oklch, var(--color-muted) 100%, transparent)",
    "--draftly-surface-hover":
      "color-mix(in oklch, var(--color-foreground) 7%, transparent)",
    "--draftly-surface-success":
      "color-mix(in oklch, var(--draftly-color-success-strong) 18%, transparent)",
    "--draftly-surface-success-strong":
      "color-mix(in oklch, var(--draftly-color-success-strong) 28%, transparent)",
    "--draftly-surface-danger":
      "color-mix(in oklch, var(--color-destructive) 16%, transparent)",
    "--draftly-surface-danger-strong":
      "color-mix(in oklch, var(--color-destructive) 24%, transparent)",
    "--draftly-surface-warning":
      "color-mix(in oklch, var(--draftly-color-warning) 20%, transparent)",
    "--draftly-surface-warning-strong":
      "color-mix(in oklch, var(--draftly-color-warning) 36%, transparent)",
    "--draftly-shadow-soft":
      "0 10px 24px color-mix(in oklch, var(--color-foreground) 14%, transparent)",
    "--draftly-shadow-strong":
      "0 12px 28px color-mix(in oklch, var(--color-foreground) 22%, transparent)",
  },

  "&.cm-draftly .cm-content": {
    width: "100%",
    maxWidth: "48rem",
    padding: "0 0.5rem",
    margin: "0 auto",
    fontFamily: "var(--user-text-font)",
    fontSize: "var(--text-base)",
    lineHeight: "1.6",
  },

  "&.cm-draftly .cm-content .cm-line": {
    paddingInline: 0,
  },

  "&.cm-draftly .cm-content .cm-widgetBuffer": {
    display: "none !important",
  },
});

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/**
 * Reset syntax highlighting for markdown elements
 * Used to disable theme colors for markdown syntax
 */
const markdownResetStyle = HighlightStyle.define([
  {
    tag: [
      t.heading,
      t.strong,
      t.emphasis,
      t.strikethrough,
      t.link,
      t.url,
      t.quote,
      t.list,
      t.meta,
      t.contentSeparator,
      t.labelName,
    ],
    color: "inherit",
    fontWeight: "inherit",
    fontStyle: "inherit",
    textDecoration: "none",
  },
]);

export const markdownResetExtension = syntaxHighlighting(markdownResetStyle, {
  fallback: false,
});
