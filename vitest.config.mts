import { defineConfig } from "vitest/config";

export default defineConfig({
  // `@/` has to keep resolving outside the Next bundler for domain tests to
  // import the way the app does.
  resolve: { tsconfigPaths: true },
  test: {
    // The domain layer is pure (AGENTS.md non-negotiable 1), so a test that
    // needs a DOM is a sign the code under test is in the wrong layer.
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/state/**"],
    },
  },
});
