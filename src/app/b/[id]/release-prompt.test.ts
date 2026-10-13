import { describe, it, expect } from "vitest";
import { releasePrompt } from "./release-prompt";

describe("releasePrompt", () => {
  it("names the buyer and the lines", () => {
    expect(releasePrompt({ handle: "alice", numbers: [3], sentNumbers: [] })).toBe("Release line 3 from @alice?");
  });
  it("warns about lines marked sent", () => {
    const text = releasePrompt({ handle: "bob", numbers: [1, 2, 4], sentNumbers: [2, 4] });
    expect(text).toContain("Release lines 1, 2, 4 from @bob?");
    expect(text).toContain("Warning: @bob marked lines 2, 4 as sent");
  });
});
