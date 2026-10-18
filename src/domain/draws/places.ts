/** A won place on the board: the top spot, 2nd or 3rd (Mosaic §5 won cells). Places past 3rd get no bull. */
export type Place = 1 | 2 | 3;

/**
 * The prize places to draw as won cells (Mosaic §5, §8; recorded ruling 17): every prize rank of 1, 2 or 3 the break
 * has, with the line the draw put there (`ranking[rank - 1]`). A place with no prize is skipped, as in the reveal (§7).
 * The landing hero (Task 6), the result page (Tasks 12a, 12b, 13), the link preview (Task 14) and the card thumbnails
 * (Task 15a) all read places from here.
 */
export function placesOf(ranking: readonly number[], prizeRanks: readonly number[]): { number: number; place: Place }[] {
  const ranks = [...new Set(prizeRanks)].filter((r): r is Place => r === 1 || r === 2 || r === 3).sort((a, b) => a - b);
  return ranks.flatMap((place) => {
    const number = ranking[place - 1];
    return number === undefined ? [] : [{ number, place }];
  });
}
