import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["tests/ci/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/helpers/setup.ts"],
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
});
