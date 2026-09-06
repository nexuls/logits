"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the field, e.g. "Project name". */
  label: string;
  /** Controls edit mode from outside — pair with `onEditingChange`. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /**
   * Makes the resting text itself the trigger: double click, or Enter/F2 once
   * focused. Leave off when an ancestor already owns the interaction, so we do
   * not nest a control inside a control.
   */
  activateOnDoubleClick?: boolean;
  /** Commit an empty value instead of treating it as a cancel. */
  allowEmpty?: boolean;
  placeholder?: string;
  className?: string;
};

/**
 * Text that becomes editable in place.
 *
 * The editor is a `contenteditable` span rather than an input so the text keeps
 * whatever type styles it inherits from its slot — no separate input theme to
 * keep in sync, and no reflow on the swap.
 *
 * Enter commits, Escape reverts, blur commits. Both keys stop propagating so a
 * commit never doubles as a canvas shortcut or a menu dismissal.
 */
export default function EditableText({
  value,
  onChange,
  label,
  editing,
  onEditingChange,
  activateOnDoubleClick = false,
  allowEmpty = false,
  placeholder,
  className,
}: Props) {
  const editorRef = useRef<HTMLSpanElement>(null);
  // Enter and Escape settle the edit before the resulting blur arrives; this
  // keeps that blur from committing a second time.
  const settledRef = useRef(false);
  const hintId = useId();
  const [internalEditing, setInternalEditing] = useState(false);

  const isEditing = editing ?? internalEditing;

  const setEditing = (next: boolean) => {
    if (editing === undefined) {
      setInternalEditing(next);
    }

    onEditingChange?.(next);
  };

  // Seed the editor from the latest value each time it opens, then select the
  // whole thing so typing replaces the name the way a rename is expected to.
  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    settledRef.current = false;
    editor.textContent = value;
    editor.focus();

    const range = document.createRange();
    range.selectNodeContents(editor);

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [isEditing, value]);

  const commit = () => {
    if (settledRef.current) {
      return;
    }

    settledRef.current = true;

    // A paste can smuggle in newlines even in plaintext-only mode.
    const next = (editorRef.current?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim();

    if (next.length === 0 && !allowEmpty) {
      setEditing(false);
      return;
    }

    if (next !== value) {
      onChange(next);
    }

    setEditing(false);
  };

  const cancel = () => {
    settledRef.current = true;
    setEditing(false);
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      commit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  };

  if (isEditing) {
    return (
      <>
        {/* biome-ignore lint/a11y/useSemanticElements: an input cannot inherit the surrounding type styles, which is the point of this component */}
        <span
          ref={editorRef}
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          role="textbox"
          tabIndex={0}
          aria-label={label}
          aria-describedby={hintId}
          aria-multiline="false"
          onKeyDown={onEditorKeyDown}
          onBlur={commit}
          onDoubleClick={(event) => event.stopPropagation()}
          className={cn(
            "block max-w-full overflow-x-auto rounded-sm bg-input/50 px-1 whitespace-nowrap outline-none",
            className,
          )}
        />
        <span id={hintId} className="sr-only">
          Press Enter to save, Escape to cancel.
        </span>
      </>
    );
  }

  const displayed = value.trim().length > 0 ? value : (placeholder ?? "");

  if (!activateOnDoubleClick) {
    return (
      <span className={cn("block truncate px-1", className)}>{displayed}</span>
    );
  }

  return (
    <button
      type="button"
      aria-label={`${label}: ${displayed}. Activate to rename.`}
      aria-keyshortcuts="F2"
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "F2") {
          event.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        "block max-w-full truncate rounded-sm px-1 text-left text-inherit outline-none hover:bg-accent/50 focus-visible:ring-3 focus-visible:ring-ring/30",
        className,
      )}
    >
      {displayed}
    </button>
  );
}
