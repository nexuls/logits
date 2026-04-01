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
- Modular data architecture scaffold introduced under `src/data/modules/*` with separate app, notebook, and fileContent stores plus a shared module base class (`src/data/dataModule.ts`).
- `src/data/store.ts` now acts as a coordinator for module composition, migration bootstrap, and serialized cross-module writes while preserving legacy `readAppData`/`writeAppData` exports during transition.
- Global app/state wiring is centralized through providers (`src/components/providers/*`).
- Root layout hydrates initial appearance settings from cookies on the server (`src/app/layout.tsx`) to minimize theme/font flicker.
- Theme and color-scheme synchronization is handled in a dedicated settings sync component (`src/components/providers/base.tsx`).
- Color scheme tokens are defined in TypeScript modules (`src/color-schemes/*`) and mounted via `style-mod`, with server-rendered stylesheet text to avoid hydration flicker.
- CodeMirror syntax/editor theme colors are now part of the same color-scheme source of truth and resolved through `src/color-schemes/index.ts`.

## Design Patterns in Use
- Provider pattern for global concerns (theme, data, sidebar, tooltips, toasts).
- Layered separation: app routes -> feature/UI components -> data/services -> shared utilities.
- Serialized write queue in data provider to avoid out-of-order persistent writes.
- Domain update helpers in `src/data/*` to keep mutation logic centralized.
- Pure domain transforms in `src/data/notebooks.ts` keep notebook/file mutation logic deterministic and testable.
- Feature hooks (`src/hooks/use-notebooks.ts`, `src/hooks/use-user-settings.ts`) expose stable APIs over provider state.

## Persistence and State Flow
- `DataProvider` is the single write boundary for app data and user settings.
- Data writes are queued through a promise chain to preserve ordering under rapid UI updates.
- New modular store path started: a `DataStore` queue now serializes module-level write operations to preserve ordering guarantees for cross-store transactions.
- User settings are persisted to both IndexedDB and cookies to keep SSR/CSR appearance state aligned.
- Local storage is used for notebook-scoped ephemeral UI state (open tabs), separate from canonical notebook/file data.

## Error Handling Decisions
- IO boundaries (IndexedDB reads/writes and hydration) should use `try/catch` and structured error logs.
- On hydration failure, the app should fall back to safe empty state and continue rendering.

## Quality Baseline
- Repository formatting is standardized with Biome (`bun run format`).
- Remaining lint debt is concentrated in Draftly plugins (regex loops with assignment expressions, non-null assertions, and implicit `any` variables).
- When touching Draftly plugins, prioritize removing `!` assertions and replacing `while ((match = regex.exec(...)) !== null)` with explicit loop variables for safer typing and readability.

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
