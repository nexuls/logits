import type { LoadResult } from "@/lib/circuit/io";
import CircuitPreview from "./circuit-preview";

type Props = {
  /** Null when the URL carries no circuit at all. */
  result: LoadResult | null;
};

/** What `/preview` shows for a decoded link: the circuit, or why there is none. */
export default function PreviewFrame({ result }: Props) {
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
              : "Open a link copied from Share or Copy link in the editor."}
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
