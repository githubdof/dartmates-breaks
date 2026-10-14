import { describe, it, expect } from "vitest";
import { hashIp } from "./ip-hash";
import { ipBucket } from "./ip-bucket";
import { requestIpHash } from "./request-ip";

const h = (xff?: string) => new Headers(xff === undefined ? {} : { "x-forwarded-for": xff });

describe("requestIpHash", () => {
  it("hashes the first x-forwarded-for entry, whole or by its rate-limit bucket", () => {
    const v6 = "2001:db8:1:2:3:4:5:6";
    expect(requestIpHash(h(` ${v6} , 10.0.0.1`))).toBe(hashIp(v6));
    expect(requestIpHash(h(`${v6}, 10.0.0.1`), { bucket: true })).toBe(hashIp(ipBucket(v6)));
    expect(requestIpHash(h("203.0.113.7"), { bucket: true })).toBe(hashIp("203.0.113.7"));
  });
  it("is undefined with no address", () => {
    expect(requestIpHash(h())).toBeUndefined();
    expect(requestIpHash(h(" , 10.0.0.1"), { bucket: true })).toBeUndefined();
  });
});
