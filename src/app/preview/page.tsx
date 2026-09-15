import type { Metadata } from "next";
import { cache } from "react";
import LinkedPreview from "@/components/preview/linked-preview";
import PreviewFrame from "@/components/preview/preview-frame";
import { decodeShareParam } from "@/lib/circuit/io";

/**
 * `/preview#data=<link data>` — one circuit, full-frame, for an `<iframe>` on
 * another site. The document travels whole in the link, so the page reads no
 * storage and a link keeps working without an account or a server copy.
 *
 * The fragment is read in the browser, by `LinkedPreview`. A `?data=` link
 * from before that is still decoded here, as long as it fits: a request line
 * past about 16 KB is refused before it reaches the page.
 */

// Shared by the metadata and the page, which would otherwise inflate it twice.
const load = cache((data: string) => decodeShareParam(data));

function queryData(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/preview">): Promise<Metadata> {
  const data = queryData((await searchParams).data);
  const result = data ? await load(data) : null;
  return { title: result?.ok ? result.document.name : "Preview" };
}

export default async function PreviewPage({
  searchParams,
}: PageProps<"/preview">) {
  const data = queryData((await searchParams).data);
  return data ? <PreviewFrame result={await load(data)} /> : <LinkedPreview />;
}
