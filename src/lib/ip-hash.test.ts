import { describe, it, expect } from "vitest";
import { hashIp } from "./ip-hash";

const k1 = Buffer.alloc(32, 1).toString("base64");
const k2 = Buffer.alloc(32, 2).toString("base64");

describe("hashIp", () => {
  it("is stable for the same ip and key", () => {
    expect(hashIp("203.0.113.7", k1)).toBe(hashIp("203.0.113.7", k1));
    expect(hashIp("203.0.113.7", k1)).toMatch(/^[0-9a-f]{32}$/);
  });
  it("differs across keys and across ips", () => {
    expect(hashIp("203.0.113.7", k1)).not.toBe(hashIp("203.0.113.7", k2));
    expect(hashIp("203.0.113.7", k1)).not.toBe(hashIp("203.0.113.8", k1));
  });
  it("uses IP_HASH_KEY from the environment by default", () => {
    expect(hashIp("203.0.113.7")).toMatch(/^[0-9a-f]{32}$/);
  });
});
