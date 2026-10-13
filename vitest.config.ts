import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["tests/concurrency/**", "e2e/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
