import { it, expect } from "vitest";
import { BOARD_FULL_CALL, boardFullAnnouncement, fullBoardKey } from "./caller-copy";

it("says the board-fills lines of the caller copy, once per viewer per break", () => {
  expect(BOARD_FULL_CALL).toBe("Board's full. Game on.");
  expect(boardFullAnnouncement("Jim")).toBe("Board's full. Every line is paid. Waiting for Jim to run the draw.");
  expect(fullBoardKey("b1")).toBe("breaks.full.b1");
});
