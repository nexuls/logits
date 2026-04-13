# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run dev        # Start Next.js dev server
bun run build      # Production build
bun run lint       # Biome lint check
bun run format     # Biome format (writes in place)
```

No test suite is configured. Biome is the only code quality tool — run `bun run lint` before committing.

## Project Overview

Logits is a browser-first notebook application for creating, organizing, and editing content. Goals:
- Fast, responsive notebook workspace for daily use
- Modular architecture — features can be added without heavy refactors
- Predictable data flow with strong type-safety across UI, state, and persistence
- Clean, readable, maintainable code

## Architecture

**Stack**: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Biome (lint + format)

**Storage**: Purely client-side — **IndexedDB** via the `idb` library. There is no backend API, no server database, no Prisma.

**Key libraries**: CodeMirror (editor), Zod (validation), react-hook-form, Radix UI primitives, mermaid, katex, dompurify, lucide-react icons.

### Codebase Structure

| Directory | Purpose |
|-----------|---------|
| `src/app/` | Next.js App Router — layouts, routes, global styles, fonts |
| `src/components/providers/` | App-wide context providers (theme, data, sidebar, tooltips, toasts) |
| `src/components/sidebar/`, `header/`, `footer/` | Shell and navigation surfaces |
| `src/components/editor/`, `draftly/`, `canvas/` | Editor, rich editing internals, canvas rendering |
| `src/components/settings/` | Settings UI |
| `src/components/ui/` | Base reusable UI primitives (shadcn-oriented) |
| `src/data/` | Schemas, persistence, domain operations |
| `src/hooks/` | Custom hooks for stateful behavior |
| `src/lib/` | Shared framework-agnostic helpers |
| `src/types/` | Shared type declarations |
| `src/functions/` | App-level function modules and command-style logic |
| `src/color-schemes/` | Theme/color-scheme token mapping |

**Dependency direction**: UI → hooks/data/lib. Data should not depend on UI. Utilities remain framework-light.

### Data layer (`src/data/`)

The data layer is organized in three tiers:

1. **Modules** (`src/data/modules/{notebook,fileContent,app}/`) — low-level IDB CRUD. Each module has:
   - `schema.ts` — Zod validation schemas
   - `functions.ts` — module class implementation
   - `use.ts` — thin hook wrapper (rarely used directly)

2. **Store** (`src/data/store.ts`) — coordinates the three modules. Key behaviors:
   - `enqueueWrite()` — serializes all writes to prevent IDB race conditions
   - Emits events: `structure-changed`, `settings-updated`, `file-content-updated`
   - Multi-store operations use shared IDB transactions

3. **Context** (`src/data/context.ts`) — `DataStoreProvider` holds hydrated state in React:
   - `notebookRecords: NotebookRecord[]`
   - `fileContents: Map<string, FileContentRecord>` (lazy-loaded cache)
   - `settings: UserSettings`
   - Subscribes to store events and reloads affected slices on change

### IDB object stores

| Store | Key | Contents |
|-------|-----|----------|
| `appPreferences` | `"singleton"` | `UserSettings` |
| `notebooks` | `notebookId` | `NotebookRecord` — includes full file tree as flat array with `parentId` |
| `fileContents` | `fileId` | Text content + stats (charCount, lineCount, byteSize) |
| `meta` | `string` | Unused |

### Hooks (`src/hooks/`)

- **`useNotebooks()`** — all notebook/file operations (create, rename, delete, move, reorder, content read/write). This is the primary hook for feature work.
- **`useUserSettings()`** — get/set user settings; writes persist to cookie and emit store events.
- **`useDebouncedCallback()`** — used for editor auto-save with a 450 ms delay.

### Initialization flow

1. **Server** (`src/app/layout.tsx`) reads `user_settings` and `resolved_system_theme` cookies → passes `initialSettings` to `BaseProvider`.
2. **`BaseProvider`** (`src/components/providers/base.tsx`) composes: `ThemeProvider` → `TooltipProvider` → `DataStoreProvider` → `SidebarProvider`. Also mounts `SettingsThemeSync` which syncs settings changes to CSS variables and cookies.
3. **`DataStoreProvider`** opens IndexedDB on mount, hydrates context state, subscribes to store events.

### Editor (`src/components/draftly/`)

Custom CodeMirror-based markdown editor. Key parts:
- `editor/` — CodeMirror setup, view plugin, theme
- `plugins/` — one file per markdown feature (headings, lists, code, math, mermaid, emoji, etc.)
- `preview/` — markdown renderer with pluggable renderers, CSS generation, syntax highlighting

The editor is consumed by `src/app/(protected)/p/[slug]/holder.tsx`, which manages:
- `draftsByFileIdRef` — in-memory editor content (ref, not state, to avoid re-renders)
- `latestSaveRequestRef` — tracks pending saves
- `cursorMetaRef` — cursor position and tab size

### Theming & color schemes (`src/color-schemes/`)

Four built-in schemes: `logits`, `github`, `material`, `catppuccin`. Each defines light/dark CSS variables and CodeMirror theme settings. The active scheme is applied as a class on `<html>` (e.g., `logits-dark`). `getColorSchemeStylesheetText()` generates the full `<style>` block injected server-side to avoid FOUC.

### Routing

| Route | Notes |
|-------|-------|
| `/` | Redirects to first notebook (`/p/[slug]`) |
| `/p/[slug]` | Main editor view; `slug` is the notebook ID |

## Code Style & Conventions

### Formatting (Biome)

- 2-space indentation, 80-char line width
- Several a11y and security rules are disabled (see `biome.json`)
- Import organization (`organizeImports`) is off — do not auto-sort imports

### Import Ordering

Use this order in each file, with a blank line between groups:
1. React and React-related imports
2. Third-party libraries
3. Internal modules/components (grouped by area if needed)
4. Styles/assets

### TypeScript & React Practices

- TypeScript everywhere; explicit types on public APIs, props, and reusable hooks
- Functional components and hooks only — no class components
- Use `useMemo`, `useCallback`, `React.memo` where profiling indicates value
- Limit `useState`/`useEffect` to necessary cases; prefer reducer/context for complex shared state
- Keep props minimal; derive computed values rather than storing redundant state

### Code Style Preferences

- Prefer single-line guard clauses without braces:
  ```tsx
  if (condition) return;
  ```
  Not:
  ```tsx
  if (condition) {
    return;
  }
  ```
- Use meaningful, domain-specific names
- Avoid deep nesting — return early or break into smaller functions
- Favor composition over inheritance
- Prefer extension points (hooks, adapters, plugin-style) over monolithic condition trees

### Error Handling

- `try/catch` around IO/persistence/network boundaries
- Fail fast for impossible states with explicit errors
- Actionable error messages; log lifecycle events and error context
- Never swallow errors silently

### Comments

- Only where intent is non-obvious — explain "why", not "what"
- Typedoc-style comments for public APIs and complex functions
- No line-by-line comments restating code
