import { useMemo } from "react";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { githubDark } from "@uiw/codemirror-theme-github";
import type { ViewUpdate } from "@codemirror/view";
import { allPlugins, draftly, ThemeEnum } from "draftly";
import { useTheme } from "next-themes";

type Props = {
  mode: "code" | "markdown";
  content: string;
  onContentChange: (content: string) => void;
  onEditorMetaChange?: (meta: {
    line: number;
    col: number;
    tabSize: number;
    selection: number;
  }) => void;
};

export default function Editor({
  mode,
  content,
  onContentChange,
  onEditorMetaChange,
}: Props) {
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
    <div className="w-full min-h-0 flex-1">
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
        onUpdate={(update: ViewUpdate) => {
          if (!onEditorMetaChange) return;

          if (
            !update.selectionSet &&
            !update.docChanged &&
            !update.viewportChanged
          )
            return;

          const head = update.state.selection.main.head;
          const line = update.state.doc.lineAt(head);

          onEditorMetaChange({
            line: line.number,
            col: head - line.from + 1,
            tabSize: update.state.tabSize,
            selection: Math.abs(
              update.state.selection.main.to - update.state.selection.main.from,
            ),
          });
        }}
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
