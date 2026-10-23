import { describe, it, expect } from "vitest";
import { cronAuthorized } from "./cron-auth";

const secret = process.env.CRON_SECRET!;
const req = (authorization?: string) => new Request("http://localhost/api/tick", { headers: authorization === undefined ? {} : { authorization } });

describe("cronAuthorized", () => {
  it("accepts the Bearer cron secret", () => {
    expect(secret.length).toBeGreaterThan(0);
    expect(cronAuthorized(req(`Bearer ${secret}`))).toBe(true);
  });
  it("refuses no header, a wrong secret of the same length, a longer one, and a lower-case bearer", () => {
    expect(cronAuthorized(req())).toBe(false);
    expect(cronAuthorized(req(`Bearer ${"x".repeat(secret.length)}`))).toBe(false);
    expect(cronAuthorized(req(`Bearer ${secret}x`))).toBe(false);
    expect(cronAuthorized(req(`bearer ${secret}`))).toBe(false);
  });
});
