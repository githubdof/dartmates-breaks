/** The Playwright suite's own database: emptied before every run (global-setup.ts), never the dev or test database. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/breaks_e2e";
