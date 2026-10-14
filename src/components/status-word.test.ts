import { it, expect } from "vitest";
import { statusWord } from "./status-word";

it("uses the community's state words", () => {
  expect(["draft", "open", "filled", "drawing", "drawn", "cancelled"].map(statusWord)).toEqual(["Draft", "Open", "Closed", "Running draw", "Ran", "Cancelled"]);
  expect(statusWord("weird")).toBe("weird");
});
