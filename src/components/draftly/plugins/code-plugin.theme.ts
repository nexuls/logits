import { createTheme } from "../editor";

/** Shared theme styles for editor + preview code blocks. */
export const codePluginTheme = createTheme({
  default: {
    // Inline code
    ".cm-draftly-code-inline": {
      fontFamily: "var(--user-monospace-font)",
      fontSize: "var(--text-sm)",
      backgroundColor: "var(--draftly-surface-2)",
      padding: "0.1rem 0.25rem",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-sm)",
    },

    // Fenced code block lines
    ".cm-draftly-code-block-line": {
      fontFamily: "var(--user-monospace-font)",
      fontSize: "var(--text-sm)",
      backgroundColor: "var(--draftly-surface-1)",
      padding: "0 1rem !important",
      lineHeight: "1.5",
      borderLeft: "1px solid var(--color-border)",
      borderRight: "1px solid var(--color-border)",
    },

    // First line of code block
    ".cm-draftly-code-block-line-start": {
      borderTopLeftRadius: "var(--radius-xl)",
      borderTopRightRadius: "var(--radius-xl)",
      position: "relative",
      overflow: "hidden",
      borderTop: "1px solid var(--color-border)",
      paddingBottom: "0.5rem !important",
    },

    // Remove top radius when header is present
    ".cm-draftly-code-block-has-header": {
      padding: "0 !important",
      paddingBottom: "0.5rem !important",
    },

    // Code block header widget
    ".cm-draftly-code-header": {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "0.25rem 1rem",
      backgroundColor: "var(--draftly-surface-3)",
      fontFamily: "var(--user-monospace-font)",
      fontSize: "var(--text-sm)",

      ".cm-draftly-code-header-left": {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",

        ".cm-draftly-code-header-title": {
          color: "var(--color-text, inherit)",
          fontWeight: "500",
        },

        ".cm-draftly-code-header-lang": {
          color: "var(--draftly-color-muted)",
          opacity: "0.8",
        },
      },

      ".cm-draftly-code-header-right": {
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",

        ".cm-draftly-code-copy-btn": {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.25rem",
          backgroundColor: "transparent",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          color: "var(--draftly-color-muted)",
          transition: "color 0.2s, background-color 0.2s",

          "&:hover": {
            backgroundColor: "var(--draftly-surface-hover)",
            color: "var(--color-text, inherit)",
          },

          "&.copied": {
            color: "var(--draftly-color-success-strong)",
          },
        },
      },
    },

    // Last line of code block
    ".cm-draftly-code-block-line-end": {
      borderBottomLeftRadius: "var(--radius-xl)",
      borderBottomRightRadius: "var(--radius-xl)",
      borderBottom: "1px solid var(--color-border)",
      paddingTop: "1rem !important",
      overflow: "clip",

      "& br": {
        display: "none",
      },

      // Caption (below code block)
      "&.cm-draftly-code-block-has-caption": {
        padding: "0 !important",
        paddingTop: "0.5rem !important",

        ".cm-draftly-code-caption": {
          textAlign: "center",
          fontSize: "var(--text-sm)",
          color: "var(--draftly-color-muted)",
          fontStyle: "italic",
          padding: "0.25rem 1rem",
          backgroundColor: "var(--draftly-surface-3)",
        },
      },
    },

    // Fence markers (```)
    ".cm-draftly-code-fence": {
      color: "var(--draftly-color-muted)",
      fontFamily: "var(--user-monospace-font)",
    },

    // Line numbers
    ".cm-draftly-code-line-numbered": {
      paddingLeft: "calc(var(--line-num-width, 2ch) + 1rem) !important",
      position: "relative",

      "&::before": {
        content: "attr(data-line-num)",
        position: "absolute",
        left: "0.5rem",
        top: "0.2rem",
        width: "var(--line-num-width, 2ch)",
        textAlign: "right",
        color: "var(--draftly-color-muted)",
        opacity: "0.6",
        fontFamily: "var(--user-monospace-font)",
        fontSize: "var(--text-sm)",
        userSelect: "none",
      },
    },

    ".cm-draftly-code-line-numbered-diff": {
      paddingLeft:
        "calc(var(--line-num-old-width, 2ch) + var(--line-num-new-width, 2ch) + 2.75rem) !important",
      position: "relative",

      "&::before": {
        content: "attr(data-line-num-old)",
        position: "absolute",
        left: "0.5rem",
        top: "0.2rem",
        width: "var(--line-num-old-width, 2ch)",
        textAlign: "right",
        color: "var(--draftly-color-muted)",
        opacity: "0.6",
        fontFamily: "var(--user-monospace-font)",
        fontSize: "var(--text-sm)",
        userSelect: "none",
      },

      "&::after": {
        content: 'attr(data-line-num-new) " " attr(data-diff-marker)',
        position: "absolute",
        left: "calc(0.5rem + var(--line-num-old-width, 2ch) + 0.75rem)",
        top: "0.2rem",
        width: "calc(var(--line-num-new-width, 2ch) + 2ch)",
        textAlign: "right",
        color: "var(--draftly-color-muted)",
        opacity: "0.6",
        fontFamily: "var(--user-monospace-font)",
        fontSize: "var(--text-sm)",
        userSelect: "none",
      },

      "&.cm-draftly-code-line-diff-gutter": {
        paddingLeft: "calc(var(--line-num-width, 2ch) + 2rem) !important",

        "&::after": {
          content: "attr(data-diff-marker)",
          position: "absolute",
          left: "calc(0.5rem + var(--line-num-width, 2ch) + 0.35rem)",
          top: "0.1rem",
          width: "1ch",
          textAlign: "right",
          fontFamily: "var(--user-monospace-font)",
          fontSize: "var(--text-sm)",
          fontWeight: "700",
          userSelect: "none",
        },
      },
    },

    // Preview: code lines (need block display for full-width highlights)
    ".cm-draftly-code-line": {
      display: "block",
      position: "relative",
      paddingLeft: "1rem",
      paddingRight: "1rem",
      lineHeight: "1.5",
      borderLeft: "3px solid transparent",
    },

    // Line highlight
    ".cm-draftly-code-line-highlight": {
      backgroundColor: "var(--draftly-surface-warning) !important",
      borderLeft: "3px solid var(--draftly-color-warning-strong) !important",
    },

    ".cm-draftly-code-line-diff-add": {
      color: "inherit",
      backgroundColor: "var(--draftly-surface-success) !important",
      borderLeft: "3px solid var(--draftly-color-success-strong) !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "var(--draftly-color-success)",
      },
    },

    ".cm-draftly-code-line-diff-del": {
      color: "inherit",
      backgroundColor: "var(--draftly-surface-danger) !important",
      borderLeft: "3px solid var(--draftly-color-danger) !important",

      "&.cm-draftly-code-line-diff-gutter::after": {
        color: "var(--draftly-color-danger)",
      },
    },

    ".cm-draftly-code-diff-sign-add": {
      color: "var(--draftly-color-success)",
      fontWeight: "700",
    },

    ".cm-draftly-code-diff-sign-del": {
      color: "var(--draftly-color-danger)",
      fontWeight: "700",
    },

    ".cm-draftly-code-diff-mod-add": {
      color: "inherit",
      backgroundColor: "var(--draftly-surface-success-strong)",
      borderRadius: "var(--radius-sm)",
      padding: "0.1rem 0",
    },

    ".cm-draftly-code-diff-mod-del": {
      color: "inherit",
      backgroundColor: "var(--draftly-surface-danger-strong)",
      borderRadius: "var(--radius-sm)",
      padding: "0.1rem 0",
    },

    // Text highlight
    ".cm-draftly-code-text-highlight": {
      color: "inherit",
      backgroundColor: "var(--draftly-surface-warning-strong)",
      borderRadius: "var(--radius-sm)",
      padding: "0.1rem 0",
    },

    // Preview: container wrapper
    ".cm-draftly-code-container": {
      margin: "1rem 0",
      borderRadius: "var(--radius-xl)",
      overflow: "hidden",
      border: "1px solid var(--color-border)",

      ".cm-draftly-code-header": {
        borderRadius: "0",
        border: "none",
        borderBottom: "1px solid var(--color-border)",
      },

      ".cm-draftly-code-block": {
        margin: "0",
        borderRadius: "0",
        border: "none",
        whiteSpace: "pre-wrap",
      },

      ".cm-draftly-code-caption": {
        borderTop: "1px solid var(--color-border)",
      },
    },

    // Preview: standalone code block (not in container)
    ".cm-draftly-code-block": {
      fontFamily: "var(--user-monospace-font)",
      fontSize: "var(--text-sm)",
      backgroundColor: "var(--draftly-surface-1)",
      padding: "1rem",
      overflow: "auto",
      position: "relative",
      borderRadius: "var(--radius-xl)",
      border: "1px solid var(--color-border)",

      "&.cm-draftly-code-block-has-header": {
        borderTopLeftRadius: "0",
        borderTopRightRadius: "0",
        borderTop: "none",
        margin: "0",
        paddingTop: "0.5rem !important",
      },

      "&.cm-draftly-code-block-has-caption": {
        borderBottomLeftRadius: "0",
        borderBottomRightRadius: "0",
        borderBottom: "none",
        paddingBottom: "0.5rem !important",
      },
    },
  },
});
