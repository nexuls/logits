import type { Metadata } from "next";
import CircuitPreview from "@/components/preview/circuit-preview";
import { decodeShareParam, type LoadResult } from "@/lib/circuit/io";

/**
 * `/preview?data=<base64>` — one circuit, full-frame, for an `<iframe>` on
 * another site. The document travels whole in the URL, so the page reads no
 * storage and a link keeps working without an account or a server copy.
 */
function load(data: string | string[] | undefined): LoadResult | null {
  const text = Array.isArray(data) ? data[0] : data;
  return text ? decodeShareParam(text) : null;
}

export async function generateMetadata({
  searchParams,
}: PageProps<"/preview">): Promise<Metadata> {
  const result = load((await searchParams).data);
  return { title: result?.ok ? result.document.name : "Preview" };
}

export default async function PreviewPage({
  searchParams,
}: PageProps<"/preview">) {
  const result = load((await searchParams).data);

  if (!result?.ok) {
    return (
      <main className="flex h-svh items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-sm font-medium">
            {result ? "This circuit could not be opened" : "No circuit to show"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {result
              ? (result.issues[0]?.message ?? "The link is malformed.")
              : "Pass a circuit document as base64 in the data parameter."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative h-svh">
      <CircuitPreview
        document={result.document}
        showPerformanceMonitor={false}
        autoPlay
      />
    </main>
  );
}
