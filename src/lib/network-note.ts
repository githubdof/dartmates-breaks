/**
 * A server action threw (dropped connection, 5xx) instead of answering. The action may well have committed, so the
 * caller refreshes the props and says so in this note rather than letting the page fall to the error boundary.
 */
export const NETWORK_NOTE = "Couldn't reach Breaks. Check your connection; the board is refreshed.";
