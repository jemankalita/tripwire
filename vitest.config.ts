import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/__tests__/**"],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
