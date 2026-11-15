import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      // CI posts the coverage report to PRs even when some tests fail.
      reportOnFailure: true,
      reporter: ["text", "json", "html", "json-summary", "lcov"],
      exclude: [
        "node_modules/",
        "build/",
        "tests/fixtures/**",
        "tests/setup.ts",
        "**/*.d.ts",
        "**/*.config.*",
      ],
    },
  },
});
