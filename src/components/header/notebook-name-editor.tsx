/* biome-ignore-all lint/a11y: contentEditable is intentionally used for inline renaming */
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../ui/button";

type Props = {
  value: string;
  onChange?: (newValue: string) => void;
  focusSignal: number | null;
  className?: string;
};

export default function NotebookNameEditor({
  value,
  onChange,
  focusSignal,
  className,
}: Props) {
  const editableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusSignal) {
      return;
    }

    const editable = editableRef.current;

    if (!editable) {
      return;
    }

    editable.focus();
    const range = document.createRange();
    range.selectNodeContents(editable);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [focusSignal]);

  const commitValue = (nextValue: string) => {
    const trimmedValue = nextValue.trim() || value;

    if (trimmedValue !== value) {
      onChange?.(trimmedValue);
    }
  };

  return (
    <div
      ref={editableRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={false}
      spellCheck={false}
      tabIndex={0}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "inline-grid place-items-center min-w-0 text-left ring-0 focus:ring-1 focus-visible:ring-1 transition-none",
        className,
      )}
      onFocus={() => {
        if (editableRef.current) {
          const range = document.createRange();
          range.selectNodeContents(editableRef.current);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }}
      onBlur={(event) => {
        commitValue(event.currentTarget.textContent || "");
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitValue(event.currentTarget.textContent || "");
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.textContent = value;
          event.currentTarget.blur();
        }
      }}
    >
      {value}
    </div>
  );
}
