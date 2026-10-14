/** Never echo provider error text to people; say what happened and what to do. */
export function sendErrorMessage(e: { status?: number; code?: string } | null): string | null {
  if (!e) return null;
  if (e.status === 429 || e.code === "over_email_send_rate_limit") return "Too many emails sent. Wait a minute, then try again.";
  return "We couldn't send the email. Check the address and try again.";
}

export const codeHelp = (email: string) => `We emailed you a 6-digit code at ${email}. Type it here.`;
