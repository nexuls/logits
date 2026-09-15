"use client";

import { useEffect, useState } from "react";

import { decodeShareParam, type LoadResult } from "@/lib/circuit/io";
import PreviewFrame from "./preview-frame";

/**
 * `/preview#data=`, read in the browser because a fragment never reaches the
 * server. Nothing is drawn until the data is decoded, so the server render and
 * the first client render agree; a changed fragment opens the new circuit.
 */
export default function LinkedPreview() {
  // `undefined` while decoding, `null` when the fragment has no data.
  const [result, setResult] = useState<LoadResult | null | undefined>();

  useEffect(() => {
    let latest = 0;
    const load = () => {
      const run = ++latest;
      const data = new URLSearchParams(window.location.hash.slice(1)).get(
        "data",
      );
      if (!data) {
        setResult(null);
        return;
      }
      decodeShareParam(data).then((next) => {
        // Two quick fragment changes can finish decoding out of order.
        if (run === latest) setResult(next);
      });
    };

    load();
    window.addEventListener("hashchange", load);
    return () => window.removeEventListener("hashchange", load);
  }, []);

  // The server titled the page before it could see the circuit.
  useEffect(() => {
    if (result?.ok) window.document.title = `${result.document.name} · Logits`;
  }, [result]);

  if (result === undefined) {
    return <main aria-busy className="h-svh bg-background" />;
  }
  return <PreviewFrame result={result} />;
}
