export type BreakStatus = "draft" | "open" | "filled" | "drawing" | "drawn" | "cancelled";

/** The community's words (design §6). Cancelled is display-only until a cancel command exists. */
export const STATUS_WORD: Record<BreakStatus, string> = {
  draft: "Draft", open: "Open", filled: "Closed", drawing: "Running draw", drawn: "Ran", cancelled: "Cancelled",
};

export function statusWord(status: string): string {
  return STATUS_WORD[status as BreakStatus] ?? status;
}
