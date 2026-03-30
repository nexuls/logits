# Logits

Logits is a notebook-first web application built with Next.js, React, and TypeScript.
It focuses on fast writing/editing workflows, file-tree organization, and configurable
appearance with persistent client-side state.

## Tech Stack

- Next.js (App Router)
- React
- TypeScript
- Tailwind CSS
- Zod
- idb (IndexedDB persistence)
- Biome (formatting/linting)

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scripts

- `npm run dev`: Start development server.
- `npm run build`: Build production bundle.
- `npm run start`: Start production server.
- `npm run lint`: Run Biome checks.
- `npm run format`: Run Biome formatter.

## Project Notes

- Architecture and contributor rules are documented in `AGENTS.md`.
- Decision history and architectural memory are tracked in `MEMORY.md`.
- Read both files before significant changes.
