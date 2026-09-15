#!/usr/bin/env bash
# Regenerates .claude/skills/logits-circuit/nodes/ from the node definitions in
# src/lib/nodes/. Run after adding or changing a node; commit the result.
#
# The docs are TypeScript template strings with shared suffixes and
# param-dependent pin layouts, so the extraction imports the registry through
# Bun rather than grepping the source.
set -euo pipefail

root="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
skill="$root/.claude/skills/logits-circuit"

# Bun resolves the `@/` alias from the tsconfig in the working directory.
cd "$root"
rm -rf "$skill/nodes"
bun "$skill/scripts/node-docs.ts" "$skill/nodes"
