type NotebookUrlOptions = {
  fileId?: string | null;
  searchParams?: { toString(): string } | string | null;
  view?: string | null;
};

export function buildNotebookUrl(
  notebookId: string,
  { fileId, searchParams, view }: NotebookUrlOptions = {},
) {
  const params = new URLSearchParams(searchParams?.toString());

  if (fileId !== undefined) {
    if (fileId) {
      params.set("file", fileId);
    } else {
      params.delete("file");
    }
  }

  if (view !== undefined) {
    if (view) {
      params.set("view", view);
    } else {
      params.delete("view");
    }
  }

  const query = params.toString();
  return query ? `/p/${notebookId}?${query}` : `/p/${notebookId}`;
}
