import { Bell, Bot, GitCommitHorizontal, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

type MarkdownFooterMeta = {
  totalLines: number;
  totalChars: number;
  totalWords: number;
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
  label,
  value,
  valueId,
}: {
  label: string;
  value: string | number;
  valueId?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span id={valueId} className="font-medium text-muted-foreground">
        {value}
      </span>
      <span>{label}</span>
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
          label="lines"
          value={markdownMeta.totalLines}
          valueId="logits-footer-lines"
        />
        <StatChip
          label="chars"
          value={markdownMeta.totalChars}
          valueId="logits-footer-chars"
        />
        <StatChip
          label="words"
          value={markdownMeta.totalWords}
          valueId="logits-footer-words"
        />
        <span className="mx-1 text-muted-foreground">|</span>
        <StatChip
          label=""
          valueId="logits-footer-cursor"
          value={`Ln ${markdownMeta.line}, Col ${markdownMeta.col}${
            markdownMeta.selection > 0 ? ` (${markdownMeta.selection} selected)` : ""
          }`}
        />
        <StatChip
          label=""
          valueId="logits-footer-tabsize"
          value={`Spaces: ${markdownMeta.tabSize}`}
        />
      </div>

      <div className="ml-2 flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="xs">
          <Bot className="size-3.5" />
          AI Copilot
        </Button>

        <Button variant="ghost" size="xs">
          <GitCommitHorizontal className="size-3.5" />
          <span id="logits-footer-version">{markdownMeta.version}</span>
        </Button>

        <Button variant="ghost" size="xs">
          <Save className="size-3.5" />
          <span id="logits-footer-save-status">
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
