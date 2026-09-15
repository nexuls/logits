import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Live checks for a circuit in the running app. Run from the repo root:
 *
 *   LOGITS_CIRCUIT=path/to/circuit.json bunx playwright test \
 *     -c .claude/skills/logits-circuit/e2e/playwright.config.ts
 *
 * Starts `bun run dev` on LOGITS_PORT (default 3123) unless one is already
 * listening there, or LOGITS_BASE_URL points somewhere else.
 */

const root = path.resolve(__dirname, "../../../..");
const port = Number(process.env.LOGITS_PORT ?? 3123);
const external = process.env.LOGITS_BASE_URL;

export default defineConfig({
  testDir: __dirname,
  outputDir: path.join(__dirname, "results"),
  reporter: [["list"]],
  // The first request compiles /preview in dev, which is slow on a cold cache.
  timeout: 120_000,
  workers: 1,
  use: {
    baseURL: external ?? `http://localhost:${port}`,
    browserName: "chromium",
    viewport: { width: 1600, height: 1000 },
    colorScheme: "dark",
  },
  webServer: external
    ? undefined
    : {
        command: `bun run dev --port ${port}`,
        cwd: root,
        url: `http://localhost:${port}/preview`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
