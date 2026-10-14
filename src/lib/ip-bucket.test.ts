import { describe, it, expect } from "vitest";
import { ipBucket } from "./ip-bucket";

describe("ipBucket", () => {
  it("keeps an IPv4 address whole", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:cb00:7107")).toBe("203.0.113.7");
  });
  it("folds an IPv6 address to its /64, however it is written", () => {
    expect(ipBucket("2001:db8:1:2:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8:1:2::9")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:0DB8:0001:0002:0000:0000:0000:0001")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:db8::1")).toBe("2001:db8:0:0::/64");
  });
  it("leaves anything it cannot read unchanged", () => {
    expect(ipBucket("not-an-ip")).toBe("not-an-ip");
    expect(ipBucket("fe80::1%eth0")).toBe("fe80::1%eth0");
  });
});
