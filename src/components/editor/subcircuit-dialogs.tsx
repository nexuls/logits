"use client";

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The two prompts in front of a chip: naming one, and deleting one.
 *
 * Both are real dialogs rather than inline fields because both are decisions
 * with consequences the user has to be told about first — how much of the
 * circuit is about to move, and how many instances are about to go with the
 * chip. The editor shortcuts stand down inside a dialog, so `Delete` and `Esc`
 * here act on the dialog and not on the selection behind it.
 */

type NameDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** What the field starts with, and what an unchanged field submits. */
  initialName: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
};

export function SubcircuitNameDialog({
  open,
  onOpenChange,
  title,
  description,
  initialName,
  submitLabel,
  onSubmit,
}: NameDialogProps) {
  // Uncontrolled from `initialName`, which is why the callers mount this only
  // while it is open: each opening then starts from the name it was given
  // rather than from whatever the last one was left on.
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  const submit = () => {
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Label htmlFor="subcircuit-name" className="text-xs">
            Name
          </Label>
          <Input
            id="subcircuit-name"
            value={name}
            autoFocus
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="Half adder"
          />

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length === 0}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type PendingSubcircuit = {
  key: string;
  name: string;
  /** How many instances of it exist, anywhere in the project. */
  instances: number;
};

type DeleteDialogProps = {
  /** The chip awaiting confirmation; null keeps the dialog closed. */
  chip: PendingSubcircuit | null;
  onClose: () => void;
  onConfirm: (key: string) => void;
};

export function DeleteSubcircuitDialog({
  chip,
  onClose,
  onConfirm,
}: DeleteDialogProps) {
  return (
    <AlertDialog
      open={chip !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{chip?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {chip && chip.instances > 0
              ? `${chip.instances} ${chip.instances === 1 ? "instance" : "instances"} of it will be removed from the circuit along with the wires that reach them. This is one undo step.`
              : "Nothing in the circuit uses it. This is one undo step."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              if (chip) onConfirm(chip.key);
              onClose();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
