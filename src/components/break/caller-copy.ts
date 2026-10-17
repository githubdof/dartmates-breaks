/** The caller's lines on the break page (Mosaic §7 caller copy): the same for every viewer, never "You", never the prize. */
export const BOARD_FULL_CALL = "Board's full. Game on.";
export const boardFullAnnouncement = (hostName: string) => `Board's full. Every line is paid. Waiting for ${hostName} to run the draw.`;
/** Board fills plays once per viewer per break, stored like the reveal's once-per-viewer flag. */
export const fullBoardKey = (breakId: string) => `breaks.full.${breakId}`;
/** The caller's call first (board fills or draw starts), then what the same refresh says: one live-region message, so neither is lost. */
export const withCall = (call: string | null, said: readonly string[]): string[] => (call ? [call, ...said] : [...said]);
/** Draw starts (§7): the caller's line while the draw runs, and what the page announces when it starts. */
export const drawStartCall = (hostName: string) => `${hostName} is stepping up to the oche.`;
export const drawStartAnnouncement = (hostName: string) => `${hostName} started the draw. The result is in about a minute.`;
