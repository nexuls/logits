import { Bell, Bot, GitCommitHorizontal, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export const FOOTER_FIELD_IDS = {
  lines: "logits-footer-lines",
  chars: "logits-footer-chars",
  words: "logits-footer-words",
  cursor: "logits-footer-cursor",
  tabSize: "logits-footer-tabsize",
  version: "logits-footer-version",
  saveStatus: "logits-footer-save-status",
} as const;

// Manipulate footer fields directly to avoid unnecessary React renders and potential performance issues with large documents.
export function setFooterField(
  id: (typeof FOOTER_FIELD_IDS)[keyof typeof FOOTER_FIELD_IDS],
  value: string,
) {
  if (typeof document === "undefined") return;
  const element = document.getElementById(id);
  if (!element || element.textContent === value) return;
  element.textContent = value;
}

type UpdateFooterParams = {
  stats: {
    lines: number;
    chars: number;
    words: number;
  };
  cursor: {
    line: number;
    col: number;
    selection?: number;
  };
  others: {
    tabSize?: number;
    saveStatus?: "saved" | "saving";
  };
};

export function updateFooter(
  ...args:
    | ["stats", UpdateFooterParams["stats"]]
    | ["cursor", UpdateFooterParams["cursor"]]
    | ["others", UpdateFooterParams["others"]]
) {
  const [field, params] = args;

  if (field === "stats") {
    setFooterField(FOOTER_FIELD_IDS.lines, String(params.lines));
    setFooterField(FOOTER_FIELD_IDS.chars, String(params.chars));
    setFooterField(FOOTER_FIELD_IDS.words, String(params.words));
    return;
  }

  if (field === "cursor") {
    const cursorValue = `Ln ${params.line}, Col ${params.col}${
      (params.selection ?? 0) > 0 ? ` (${params.selection} selected)` : ""
    }`;
    setFooterField(FOOTER_FIELD_IDS.cursor, cursorValue);
  }

  if (field === "others") {
    if (params.tabSize !== undefined)
      setFooterField(FOOTER_FIELD_IDS.tabSize, String(params.tabSize) || "4");
    if (params.saveStatus !== undefined)
      setFooterField(
        FOOTER_FIELD_IDS.saveStatus,
        params.saveStatus === "saving" ? "Saving" : "Saved",
      );
  }
}

type MarkdownFooterMeta = {
  lines: number;
  chars: number;
  words: number;
  line: number;
  col: number;
  selection: number;
  tabSize: number;
  version: string;
  saveStatus: "saved" | "saving";
};

type Props = {
  view: "markdown" | "other";
  markdownMeta?: MarkdownFooterMeta;
};

function StatChip({
  pre,
  post,
  value,
  valueId,
}: {
  pre?: string;
  post?: string;
  value: string | number;
  valueId?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {pre && <span>{pre}</span>}
      <span id={valueId} className="font-medium text-foreground/60">
        {value}
      </span>
      {post && <span>{post}</span>}
    </div>
  );
}

export default function Footer({ view, markdownMeta }: Props) {
  if (view !== "markdown" || !markdownMeta) {
    return (
      <footer className="flex h-8 items-center justify-between border-t bg-background/80 px-3 text-xs text-muted-foreground backdrop-blur-sm">
        <span>Footer view is not defined yet for this screen.</span>
        <Button variant="ghost" size="xs" disabled>
          Configure Footer
        </Button>
      </footer>
    );
  }

  return (
    <footer className="flex h-8 items-center justify-between border-t bg-background/80 px-3 gap-3 text-xs backdrop-blur-sm">
      <div className="flex min-w-0 items-center gap-3 overflow-x-auto">
        <StatChip
          post="lines"
          value={markdownMeta.lines}
          valueId={FOOTER_FIELD_IDS.lines}
        />
        <StatChip
          post="chars"
          value={markdownMeta.chars}
          valueId={FOOTER_FIELD_IDS.chars}
        />
        <StatChip
          post="words"
          value={markdownMeta.words}
          valueId={FOOTER_FIELD_IDS.words}
        />
        <span className="mx-1 text-muted-foreground">|</span>
        <StatChip
          valueId={FOOTER_FIELD_IDS.cursor}
          value={`Ln ${markdownMeta.line}, Col ${markdownMeta.col}${
            markdownMeta.selection > 0
              ? ` (${markdownMeta.selection} selected)`
              : ""
          }`}
        />
        <StatChip
          pre="Spaces:"
          valueId={FOOTER_FIELD_IDS.tabSize}
          value={`${markdownMeta.tabSize}`}
        />
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="xs">
          <Bot className="size-3.5" />
          AI Copilot
        </Button>

        <Button variant="ghost" size="xs">
          <GitCommitHorizontal className="size-3.5" />
          <span id={FOOTER_FIELD_IDS.version}>{markdownMeta.version}</span>
        </Button>

        <Button variant="ghost" size="xs">
          <Save className="size-3.5" />
          <span id={FOOTER_FIELD_IDS.saveStatus}>
            {markdownMeta.saveStatus === "saving" ? "Saving" : "Saved"}
          </span>
        </Button>

        <Button variant="ghost" size="icon-xs" aria-label="Notification center">
          <Bell className="size-3.5" />
        </Button>
      </div>
    </footer>
  );
}
