import {
  deserialize,
  encodeShareParam,
  FILE_EXTENSION,
  FILE_MIME_TYPE,
  serialize,
} from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import { getRootDocument } from "@/state/document";
import {
  type CreateResult,
  createProjectFrom,
  openProject,
} from "@/state/projects-store";

/**
 * Project actions that more than one menu offers — the canvas header, a
 * sidebar row and its right-click menu, the toolbar — kept here so they cannot
 * drift into slightly different imports and exports.
 */

export type ImportResult =
  | { ok: true; id: string; message: string }
  | { ok: false; message: string };

/**
 * The circuit behind a project id, as the user currently sees it.
 *
 * The open document wins over storage: its latest edits may still be waiting
 * on the autosave, and a copy or an export has to include them.
 */
function projectDocument(id: string): CircuitDocument | null {
  // The *root* document, chips and all: a chip being open does not make the
  // project a different thing to export, duplicate or share.
  const open = getRootDocument();
  return open?.id === id ? open : openProject(id);
}

export function duplicateProject(id: string): CreateResult {
  const source = projectDocument(id);
  if (!source) return { ok: false, error: "That project could not be read." };
  return createProjectFrom(source);
}

export function exportProject(id: string): boolean {
  const document = projectDocument(id);
  if (!document) return false;
  downloadCircuit(document);
  return true;
}

export type CopyLinkResult = { ok: boolean; message: string };

export function copyProjectLink(id: string): Promise<CopyLinkResult> {
  const document = projectDocument(id);
  if (!document) {
    return Promise.resolve({
      ok: false,
      message: "That project could not be read.",
    });
  }
  return copyCircuitLink(document);
}

/**
 * Puts the circuit's `/preview` link on the clipboard. The link carries the
 * whole document, so it shows the circuit as it is now and does not follow
 * later edits.
 *
 * The data rides in the fragment, not the query: servers refuse a request line
 * past about 16 KB (HTTP 431), and a fragment is never sent to the server.
 */
export async function copyCircuitLink(
  document: CircuitDocument,
): Promise<CopyLinkResult> {
  const url = encodeShareParam(document).then(
    (data) => `${window.location.origin}/preview#data=${data}`,
  );
  try {
    await writeClipboardText(url);
    return { ok: true, message: "Link copied." };
  } catch {
    // No clipboard outside a secure context, or permission refused.
    return { ok: false, message: "The link could not be copied." };
  }
}

async function writeClipboardText(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem === "function") {
    try {
      // Handed over as a pending item so the write starts inside the click:
      // Safari drops the user activation across the await compression takes.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": text.then(
            (value) => new Blob([value], { type: "text/plain" }),
          ),
        }),
      ]);
      return;
    } catch {
      // A browser that has `ClipboardItem` but not pending items: plain text.
    }
  }
  await navigator.clipboard.writeText(await text);
}

export function downloadCircuit(document: CircuitDocument): void {
  const blob = new Blob([serialize(document)], { type: FILE_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${document.name}${FILE_EXTENSION}`;
  link.click();
  // Revoked on the next tick rather than immediately: Safari has not started
  // the download by the time `click()` returns.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Asks for a circuit file and adds it as a new project.
 *
 * Always a *new* project with a fresh id, never a replacement for the open
 * one: a file exported from this browser carries the id of the project it
 * came from, and loading it under that id would overwrite that project on the
 * next autosave.
 *
 * The input is created per call rather than mounted by each caller, so a menu
 * item can offer import without owning a hidden element that outlives it.
 * `onDone` is not called when the picker is dismissed.
 */
export function importCircuitFile(onDone: (result: ImportResult) => void) {
  const input = window.document.createElement("input");
  input.type = "file";
  input.accept = `${FILE_MIME_TYPE},.json`;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    file
      .text()
      .then((text) => onDone(importCircuitText(text)))
      .catch(() =>
        onDone({ ok: false, message: "That file could not be read." }),
      );
  });
  input.click();
}

function importCircuitText(text: string): ImportResult {
  const loaded = deserialize(text);
  if (!loaded.ok) {
    return {
      ok: false,
      message: loaded.issues[0]?.message ?? "That file is not a circuit.",
    };
  }

  const created = createProjectFrom(loaded.document);
  if (!created.ok) return { ok: false, message: created.error };

  return {
    ok: true,
    id: created.id,
    message:
      loaded.issues.length > 0
        ? `Imported with ${loaded.issues.length} issue(s).`
        : `Imported “${loaded.document.name}”.`,
  };
}
