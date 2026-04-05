import { syntaxTree } from "@codemirror/language";
import { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import {
  type DecorationContext,
  DraftlyPlugin,
} from "../editor/plugin";
import { createTheme } from "../editor";

const paragraphDecoration = Decoration.line({
  class: "cm-draftly-paragraph",
});

/**
 * ParagraphPlugin - Adds top and bottom padding to paragraphs in preview
 *
 * Applies visual spacing to markdown paragraphs for better readability
 */
export class ParagraphPlugin extends DraftlyPlugin {
  readonly name = "paragraph";
  readonly version = "1.0.0";
  override readonly requiredNodes = ["Paragraph"] as const;

  /**
   * Plugin theme for preview styling
   */
  override get theme() {
    return theme;
  }

  override buildDecorations(ctx: DecorationContext): void {
    const { view, decorations } = ctx;

    syntaxTree(view.state).iterate({
      enter: (node) => {
        if (node.name !== "Paragraph") {
          return;
        }

        const startLine = view.state.doc.lineAt(node.from).number;
        const endLine = view.state.doc.lineAt(Math.max(node.to - 1, node.from)).number;

        for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
          const line = view.state.doc.line(lineNumber);
          decorations.push(paragraphDecoration.range(line.from));
        }
      },
    });
  }

  override renderToHTML(node: SyntaxNode, children: string): string | null {
    if (node.name !== "Paragraph") {
      return null;
    }

    return `<p class="cm-draftly-paragraph">${children}</p>`;
  }
}

const theme = createTheme({
  default: {
    ".cm-draftly-paragraph": {
      // paddingTop: "0.5em",
      paddingBottom: "0.5em",
      // opacity: 0.9,
      color: "color-mix(in oklab, var(--color-foreground) 80%, transparent);",
    },
  },
});
