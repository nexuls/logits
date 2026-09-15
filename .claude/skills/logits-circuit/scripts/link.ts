import { readFileSync } from "node:fs";
import { encodeShareParam, fromJson } from "@/lib/circuit/io";

// Usage: bun .claude/skills/logits-circuit/scripts/link.ts <circuit.json> [baseUrl]
const [file, base = "http://localhost:3000"] = process.argv.slice(2);
if (!file) {
  console.error("usage: link.ts <circuit.json> [baseUrl]");
  process.exit(2);
}
const loaded = fromJson(JSON.parse(readFileSync(file, "utf8")));
if (!loaded.ok) {
  console.error(JSON.stringify(loaded.issues, null, 2));
  process.exit(1);
}
console.log(`${base}/preview#data=${await encodeShareParam(loaded.document)}`);
