import React, { useMemo } from "react";
import CodeMirror, { Extension } from "@uiw/react-codemirror";
import { githubDark } from "@uiw/codemirror-theme-github";
import {
  allPlugins,
  draftly,
  ThemeEnum,
} from "draftly";
import { useTheme } from "next-themes";

type Props = {
  mode: "code" | "markdown";
  content: string;
  onContentChange: (content: string) => void;
};

export default function Editor({ mode, content, onContentChange }: Props) {
  const { resolvedTheme: theme } = useTheme();

  const defaultExtensions = useMemo<Extension[]>(
    () =>
      draftly({
        theme:
          theme && theme !== "system"
            ? theme.includes("dark")
              ? ThemeEnum.DARK
              : ThemeEnum.LIGHT
            : ThemeEnum.AUTO,
        baseStyles: true,
        plugins: allPlugins,
        markdown: [],
        extensions: [],
        keymap: [],
        disableViewPlugin: mode === "code",
        defaultKeybindings: true,
        history: true,
        indentWithTab: true,
        highlightActiveLine: true,
        lineWrapping: true,
      }),
    [theme, mode],
  );

  return (
    <div className="h-full w-full">
      <CodeMirror
        key={`draftly-editor-${mode}`}
        id={"draftly-editor"}
        // ref={editor}
        autoFocus={false}
        className={"h-full w-full"}
        height="100%"
        width="100%"
        value={content}
        placeholder={"Write something..."}
        onChange={onContentChange}
        theme={githubDark}
        extensions={[...defaultExtensions]}
        basicSetup={{
          lineNumbers: mode === "code",
          foldGutter: mode === "code",
          highlightActiveLine: mode === "code",
          highlightActiveLineGutter: mode === "code",
          highlightSelectionMatches: mode === "code",
          drawSelection: false,
        }}
      />
    </div>
  );
}
