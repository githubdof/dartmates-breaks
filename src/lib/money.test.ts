import { it, expect } from "vitest";
import { formatCents } from "./money";
it("formats cents as dollars", () => { expect(formatCents(2000)).toBe("$20.00"); expect(formatCents(250)).toBe("$2.50"); expect(formatCents(0)).toBe("$0.00"); });
