import { it, expect } from "vitest";
import { codeHelp, sendErrorMessage } from "./messages";

it("maps Supabase errors to fixed messages", () => {
  expect(sendErrorMessage(null)).toBeNull();
  expect(sendErrorMessage({ status: 429 })).toBe("Too many emails sent. Wait a minute, then try again.");
  expect(sendErrorMessage({ code: "over_email_send_rate_limit" })).toBe("Too many emails sent. Wait a minute, then try again.");
  expect(sendErrorMessage({ status: 500, code: "unexpected_failure" })).toBe("We couldn't send the email. Check the address and try again.");
});

it("leads with the code", () => {
  expect(codeHelp("a@b.co")).toBe("We emailed you a 6-digit code at a@b.co. Type it here.");
});
