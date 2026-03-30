# MEMORY

## Project Goals
- Build a modular notebook-focused web app with strong UX and fast interactions.
- Keep architecture scalable, type-safe, and maintainable.
- Preserve clear data flow between UI state, settings, and persistence.

## Architecture Decisions
- Next.js App Router is the route/composition layer.
- React functional components + hooks are the default UI pattern.
- TypeScript is required for all core app code.
- Zod-backed schemas are used for normalization and data validation boundaries.
- Client persistence uses IndexedDB via idb (`src/data/store.ts`).
- Global app/state wiring is centralized through providers (`src/components/providers/*`).

## Design Patterns in Use
- Provider pattern for global concerns (theme, data, sidebar, tooltips, toasts).
- Layered separation: app routes -> feature/UI components -> data/services -> shared utilities.
- Serialized write queue in data provider to avoid out-of-order persistent writes.
- Domain update helpers in `src/data/*` to keep mutation logic centralized.

## Conventions
- Import order:
  1. React/react-related
  2. Third-party
  3. Internal modules (grouped)
  4. Styles/assets
- Single-line guards without braces for one-line statements.
- Keep comments brief and intent-focused.

## How to Use This File
- Read this file before significant refactors or architecture changes.
- Update this file when introducing new architecture decisions, patterns, or major constraints.
- Keep entries concise and decision-oriented.
