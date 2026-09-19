import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CircuitPreview from "@/components/preview/circuit-preview";
import ExamplePreviewActions from "@/components/preview/example-preview-actions";
import { examples, getExample } from "@/example";

/**
 * `/preview/example/<document id>` — a shipped example, full-frame, running.
 *
 * The sibling `/preview#data=` route carries a whole document in the link
 * because it has nowhere to look one up; an example is already in the bundle,
 * so its id is the whole address. That makes the link short enough to paste
 * anywhere, and lets the page be prerendered with a real title and blurb,
 * which a fragment-decoded link can never have.
 *
 * An id that is not an example 404s rather than falling back to an empty
 * canvas: the circuit skill's Playwright suite probes this route and uses the
 * response status to decide whether to send a `#data=` link instead.
 */

export function generateStaticParams() {
  return examples.map((example) => ({ exampleId: example.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/preview/example/[exampleId]">): Promise<Metadata> {
  const example = getExample((await params).exampleId);
  if (!example) return { title: "Example not found" };
  return { title: example.name, description: example.summary };
}

export default async function ExamplePreviewPage({
  params,
}: PageProps<"/preview/example/[exampleId]">) {
  const example = getExample((await params).exampleId);
  if (!example) notFound();

  return (
    <main className="relative h-svh">
      {/* Framed as the editor opens it, for the reason `/preview` gives: the
          author sets the document's default view on purpose. */}
      <CircuitPreview
        document={example.document}
        showPerformanceMonitor={false}
        fitView={false}
        autoPlay
      />
      {/* The id, not the document: the actions look it up in the same bundled
          catalog, so the circuit is not serialised into the payload twice. */}
      <ExamplePreviewActions exampleId={example.id} />
    </main>
  );
}
