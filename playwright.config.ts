import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./e2e/e2e-db";

export default defineConfig({
  testDir: "e2e", timeout: 60_000, retries: 0, workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3000", ...devices["iPhone 13"], defaultBrowserType: "chromium" },
  // Never reuse a server already on :3000: it would be a dev server on the dev database (port rule: kill it first).
  webServer: {
    command: "pnpm build && pnpm start", url: "http://localhost:3000", reuseExistingServer: false, timeout: 180_000,
    env: { E2E_SECRET: "e2e", BEACON: "fake", DATABASE_URL: E2E_DATABASE_URL },
  },
});
