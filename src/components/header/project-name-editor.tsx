/* biome-ignore-all lint/a11y: contentEditable is intentionally used for project-name editing */
"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "../ui/button";

type Props = {
  projectName: string;
  onProjectNameChange?: (newName: string) => void;
  focusSignal?: number;
};

export default function ProjectNameEditor({
  projectName,
  onProjectNameChange,
  focusSignal,
}: Props) {
  const projectNameEditableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusSignal) {
      return;
    }

    const editable = projectNameEditableRef.current;

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

  const commitProjectName = (value: string) => {
    const nextValue = value.trim() || projectName;

    if (nextValue !== projectName && onProjectNameChange) {
      onProjectNameChange(nextValue);
    }
  };

  return (
    <div
      ref={projectNameEditableRef}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={false}
      spellCheck={false}
      tabIndex={0}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "inline-grid place-items-center min-w-0 max-w-64 text-left ring-0 focus:ring-1 focus-visible:ring-1 transition-none",
      )}
      onFocus={() => {
        if (projectNameEditableRef.current) {
          const range = document.createRange();
          range.selectNodeContents(projectNameEditableRef.current);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }}
      onBlur={(event) => {
        commitProjectName(event.currentTarget.textContent || "");
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitProjectName(event.currentTarget.textContent || "");
          event.currentTarget.blur();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.textContent = projectName;
          event.currentTarget.blur();
        }
      }}
    >
      {projectName}
    </div>
  );
}
