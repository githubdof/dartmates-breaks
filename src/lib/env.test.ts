import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const good = {
  DATABASE_URL: "postgresql://u:p@h:5432/db",
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  DRAW_KEY_V1: Buffer.alloc(32, 1).toString("base64"),
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
});
