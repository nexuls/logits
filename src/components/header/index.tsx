"use client";

import { FileText, PanelLeftIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import HeaderMenu from "./header-menu";
import NotebookNameEditor from "./notebook-name-editor";

type Props =
  | {
      placeholder: true;
      className?: string;
    }
  | {
      placeholder: false;
      className?: string;
      notebookName: string;
      currentFileName?: string;
      onNotebookNameChange?: (newName: string) => void;
      onCurrentFileNameChange?: (newName: string) => void;
    };

export default function Header(props: Props) {
  const { toggleSidebar } = useSidebar();
  const [notebookRenameSignal, setNotebookRenameSignal] = useState<
    number | null
  >(null);
  const [fileRenameSignal, setFileRenameSignal] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "absolute left-0 right-0 top-0 z-50 w-fit rounded-br-xl bg-background/80 p-2 backdrop-blur-sm",
        props.className,
      )}
    >
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={() => toggleSidebar()}>
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>

        {props.placeholder ? null : (
          <>
            <NotebookNameEditor
              value={props.notebookName}
              onChange={props.onNotebookNameChange}
              focusSignal={notebookRenameSignal}
              className="max-w-56"
            />
            {props.currentFileName ? (
              <>
                <span className="text-muted-foreground">/</span>
                <div className="flex items-center gap-1">
                  <FileText className="size-4 text-muted-foreground" />
                  <NotebookNameEditor
                    value={props.currentFileName}
                    onChange={props.onCurrentFileNameChange}
                    focusSignal={fileRenameSignal}
                    className="max-w-72"
                  />
                </div>
              </>
            ) : null}
            <HeaderMenu
              canRenameFile={Boolean(props.currentFileName)}
              onRenameNotebookRequest={() => {
                setNotebookRenameSignal((value) => (value ?? 0) + 1);
              }}
              onRenameCurrentFileRequest={() => {
                setFileRenameSignal((value) => (value ?? 0) + 1);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
