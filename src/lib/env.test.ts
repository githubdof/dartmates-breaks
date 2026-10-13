import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const good = {
  DATABASE_URL: "postgresql://u:p@h:5432/db",
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  DRAW_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
  IP_HASH_KEY: Buffer.alloc(32, 2).toString("base64"),
  CRON_SECRET: "s",
  APP_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("accepts a complete env", () => {
    expect(parseEnv(good).APP_URL).toBe("http://localhost:3000");
  });
  it("rejects a DRAW_KEY_V1 that is not 32 bytes", () => {
    expect(() => parseEnv({ ...good, DRAW_KEY_V1: "c2hvcnQ=" })).toThrow(/DRAW_KEY_V1/);
  });
  it("rejects a missing CRON_SECRET", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { CRON_SECRET: _omit, ...rest } = good;
    expect(() => parseEnv(rest)).toThrow(/CRON_SECRET/);
  });
  it("rejects an IP_HASH_KEY that is not 32 bytes", () => {
    expect(() => parseEnv({ ...good, IP_HASH_KEY: "c2hvcnQ=" })).toThrow(/IP_HASH_KEY/);
  });
  it("allows BEACON=fake and E2E_SECRET off Vercel", () => {
    expect(() => parseEnv({ ...good, BEACON: "fake", E2E_SECRET: "e2e" })).not.toThrow();
  });
  it("refuses BEACON=fake or E2E_SECRET on any Vercel deploy", () => {
    expect(() => parseEnv({ ...good, VERCEL_ENV: "preview", BEACON: "fake" })).toThrow(/BEACON=fake/);
    expect(() => parseEnv({ ...good, VERCEL_ENV: "development", E2E_SECRET: "x" })).toThrow(/E2E_SECRET/);
    expect(() => parseEnv({ ...good, VERCEL_ENV: "production", BEACON: "drand" })).not.toThrow();
  });
});
