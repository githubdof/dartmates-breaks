import { describe, it, expect } from "vitest";
import { formatCents, formatMoney } from "./money";

describe("formatCents", () => {
  it("always prints two decimals (deep links, machine text)", () => {
    expect(formatCents(2000)).toBe("$20.00"); expect(formatCents(250)).toBe("$2.50"); expect(formatCents(0)).toBe("$0.00");
  });
});

describe("formatMoney", () => {
  it("drops zero cents and groups thousands", () => {
    expect(formatMoney(500)).toBe("$5");
    expect(formatMoney(550)).toBe("$5.50");
    expect(formatMoney(5)).toBe("$0.05");
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(125000)).toBe("$1,250");
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(100000000)).toBe("$1,000,000");
    expect(formatMoney(-250)).toBe("-$2.50");
  });
});
