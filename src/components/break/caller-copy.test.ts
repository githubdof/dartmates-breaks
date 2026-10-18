import { it, expect } from "vitest";
import { BOARD_FULL_CALL, boardFullAnnouncement, drawStartAnnouncement, drawStartCall, fullBoardKey, withCall } from "./caller-copy";

it("says the board-fills lines of the caller copy, once per viewer per break", () => {
  expect(BOARD_FULL_CALL).toBe("Board's full. Game on.");
  expect(boardFullAnnouncement("Jim")).toBe("Board's full. Every line is paid. Waiting for Jim to run the draw.");
  expect(fullBoardKey("b1")).toBe("breaks.full.b1");
});

it("puts the board-fills call before what the same refresh says, so neither is lost", () => {
  const call = boardFullAnnouncement("Jim");
  expect(withCall(call, ["Jim ticked you paid: line 4."])).toEqual([call, "Jim ticked you paid: line 4."]);
  expect(withCall(null, ["Line 7 was just taken."])).toEqual(["Line 7 was just taken."]);
  expect(withCall(call, [])).toEqual([call]);
});

it("says the draw-starts lines", () => {
  expect(drawStartCall("Jim")).toBe("Jim is stepping up to the oche.");
  expect(drawStartAnnouncement("Jim")).toBe("Jim started the draw. The result is in about a minute.");
});
