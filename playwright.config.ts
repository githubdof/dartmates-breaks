import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "e2e", timeout: 60_000, retries: 0, workers: 1,
  use: { baseURL: "http://localhost:3000", ...devices["iPhone 13"], defaultBrowserType: "chromium" },
  webServer: { command: "pnpm build && pnpm start", url: "http://localhost:3000", reuseExistingServer: true, env: { E2E_SECRET: "e2e", BEACON: "fake" }, timeout: 180_000 },
});
