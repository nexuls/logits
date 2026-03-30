# AGENTS

## 1) Overview

### Project Summary
Logits is a Next.js + React + TypeScript + bun notebook application focused on creating, organizing, and editing notebook content in a modern browser-first experience.

The app provides:
- Notebook and file organization
- Rich editing workflows (Markdown and editor plugins)
- Configurable appearance and theme settings
- Client-side persistence for app data and user settings

### Project Goals
- Deliver a fast, responsive notebook workspace for daily use.
- Keep architecture modular so features can be added without heavy refactors.
- Maintain predictable data flow and strong type-safety across UI, state, and persistence layers.
- Preserve readability and long-term maintainability through clean architecture and coding standards.

## 2) Codebase Structure

### Root Files
- `README.md`: Basic setup and run instructions.
- `AGENTS.md`: Development and architecture guidance for contributors and agents.
- `MEMORY.md`: Concise project decisions/history log. Read before significant changes.
- `package.json`: Scripts and dependency definitions.
- `tsconfig.json`: TypeScript configuration and path aliasing.
- `biome.json`: Formatting and linting rules.
- `next.config.ts`: Next.js runtime/build configuration.
- `components.json`: UI/component generator metadata.
- `postcss.config.mjs`: PostCSS/Tailwind integration.

### Application Source (`src/`)
- `app/`: Next.js App Router entrypoints, layouts, routes, and global styles.
	- `layout.tsx`: Root layout, initial cookie-based hydration values, providers bootstrap.
	- `page.tsx`: Root route behavior and initial notebook routing.
	- `(protected)/p/[slug]/`: Notebook route segment.
	- `globals.css`: Global style layer.
	- `fonts.ts`: Font variable/class utilities.
- `components/`: Reusable UI and feature modules.
	- `providers/`: App-wide context providers (theme, data, sidebar, tooltips, toasts).
	- `sidebar/`, `header/`, `footer/`: Shell/navigation surface.
	- `editor/`, `draftly/`, `canvas/`, `settings/`: Domain features.
	- `ui/`: Base reusable UI primitives and composition components.
- `data/`: Data contracts, persistence, and domain operations.
	- `schema/`: Zod-driven schemas and normalization.
	- `store.ts`: IndexedDB persistence adapter.
	- `settings.ts`: Settings transformation/update helpers.
	- `settings-cookie.ts`: Cookie serialization/deserialization for SSR/CSR sync.
	- `notebooks.ts`: Notebook-level data operations.
- `hooks/`: Focused custom hooks for stateful behavior and reusable side effects.
- `lib/`: Shared framework-agnostic helpers/utilities.
- `types/`: Shared type declarations.
- `functions/`: App-level function modules and command-style logic.
- `color-schemes/`: Theme/color-scheme token mapping and exported helpers.

### Architecture and Separation of Concerns
- Route layer (`src/app`) handles page composition and routing concerns.
- Feature/component layer (`src/components`) handles UI and user interactions.
- Data layer (`src/data`) owns schemas, normalization, persistence, and domain updates.
- Shared layer (`src/hooks`, `src/lib`, `src/types`) provides reusable utilities and contracts.

Keep dependencies directed inward:
- UI can depend on hooks/data/lib.
- Data should not depend on UI components.
- Utilities should remain framework-light where possible.

## 3) Main Components and Responsibilities

### App Shell and Providers
- `components/providers/base.tsx`: Wires global providers (theme, data context, sidebar, tooltip, toaster) and syncs appearance settings to DOM/CSS variables.
- `components/providers/data.tsx`: Central client data/settings context, hydration lifecycle, and serialized write queue for persistent updates.

### Navigation and Workspace
- `components/header/*`, `components/footer/*`: Global app chrome.
- `components/sidebar/*`: File tree, notebook settings, navigation actions, user controls.

### Editing and Content
- `components/editor/*`: Editor wrappers and notebook editing flows.
- `components/draftly/*`: Rich editor internals, plugins, preview, and extension points.
- `components/canvas/*`: Canvas rendering and interactions for visual content.

### Data and Domain
- `data/store.ts`: Persistent storage reads/writes.
- `data/schema/*`: Runtime validation/normalization and stable data contracts.
- `data/settings.ts` + `data/settings-cookie.ts`: Settings state transitions and cross-environment sync.
- `hooks/use-notebooks.ts`, `hooks/use-user-settings.ts`: Feature-friendly APIs over data context.

## 4) Technologies and Libraries

### Core Platform
- TypeScript
- React 19
- Next.js 16 (App Router)

### Styling and UI
- Tailwind CSS 4
- tw-animate-css
- shadcn-oriented component setup
- Radix/base UI primitives and related composition utilities
- lucide-react icons

### State, Forms, Validation, and Data
- React Context + hooks-based local state
- react-hook-form
- @hookform/resolvers
- zod (preferred for schema validation and parsing)
- idb (IndexedDB persistence)

### Editor and Rendering
- CodeMirror ecosystem
- mermaid
- katex
- dompurify

### Quality Tooling
- Biome (format/lint)

## 5) Contribution Guidelines

### General Workflow
1. Read `AGENTS.md` and `MEMORY.md` before significant changes.
2. Make small, focused changes by module.
3. Keep each PR/task scoped to one concern when possible.
4. Update `MEMORY.md` when architecture or design decisions change.

### Clean Architecture and SOLID
- Separate concerns into route, feature/UI, data, and shared layers.
- Use meaningful, domain-specific names.
- Keep functions/classes focused on a single responsibility.
- Favor composition over inheritance.
- Depend on abstractions/contracts (types, schemas, interfaces) over concrete implementation details.
- Avoid tight coupling between UI and persistence logic.

### Readability and Maintainability
- Follow existing formatting and 2-space indentation.
- Keep comments concise and only where intent is non-obvious.
- Prefer reusable utilities/hooks over copy-paste logic.
- Keep modules small; split files when a component starts handling multiple concerns.

### TypeScript and React Practices
- Prefer TypeScript everywhere.
- Use functional components and hooks.
- Avoid class components unless strictly necessary.
- Prefer explicit types on public APIs, props, and reusable hooks.
- Use memoization (`useMemo`, `useCallback`, `React.memo`) for expensive/repeated computations where profiling indicates value.
- Limit `useState`/`useEffect` usage to necessary cases; use reducer/context patterns for complex shared state.
- Keep props minimal and focused; derive computed values rather than storing redundant state.

### Import Ordering Convention
Use this import order in each file:
1. React and React-related imports.
2. Third-party libraries.
3. Internal modules/components (grouped by area if needed).
4. Styles/assets.

Maintain a blank line between groups.

### Code Style Preferences
- Prefer single-line guard clauses without braces for one-liners:

```tsx
if (condition) return;
```

Not:

```tsx
if (condition) {
	return;
}
```

### Error Handling and Logging
- Handle recoverable failures with `try/catch` around IO/persistence/network boundaries.
- Fail fast for impossible states with explicit errors.
- Provide actionable error messages.
- Log important lifecycle events and error contexts for debugging.
- Avoid swallowing errors silently.

### Modularity and Scalability
- Add features as isolated modules with clear boundaries.
- Prefer extension points (hooks, adapters, plugin-style composition) over monolithic condition trees.
- Keep data updates deterministic and centralized in data-layer helpers.
- Use stable schemas and normalization at boundaries to prevent data drift.

### Testing Guidelines (Required for New Features/Refactors)
Even if tests are not required to be added immediately for every change, all contributors should follow these standards when adding tests:
- Write unit tests for data transformations, schema normalization, and utility functions.
- Write integration tests for provider-driven flows and critical user interactions.
- Cover error paths and edge cases (invalid data, empty states, persistence failures).
- Keep tests deterministic and avoid brittle timing-based assertions.
- Prefer behavior-focused assertions over implementation details.

### Documentation Guidelines
Even if full documentation updates are not mandatory for every small change, contributors should:
- Document architecture-impacting decisions in `MEMORY.md`.
- Update `AGENTS.md` when conventions or structure change.
- Add concise module-level notes when introducing non-obvious patterns.
- Keep docs brief, current, and decision-oriented.

## MEMORY.md Maintenance Policy

`MEMORY.md` is the project memory log and must remain concise.

### Always Include
- Project goals and guiding principles.
- Architectural decisions and rationale.
- Introduced patterns and notable trade-offs.
- Important operational constraints and conventions.

### Avoid Including
- Temporary debugging notes with no long-term value.
- Verbose meeting transcripts or duplicated information.
- Low-impact implementation details that are obvious from code.

### Update Frequency
- Update after meaningful architecture, data model, or workflow changes.
- Review before significant implementation work to keep continuity with past decisions.

