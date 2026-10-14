import { it, expect } from "vitest";
import { payLinks } from "./pay-links";

it("builds a venmo deep link with a web fallback, and a paypal.me link", () => {
  expect(payLinks({ venmo: "@Jim-Roberts-36", paypal: "JamesRoberts603182" }, 4000)).toEqual({
    venmo: { app: "venmo://paycharge?txn=pay&recipients=Jim-Roberts-36&amount=40.00&note=", web: "https://account.venmo.com/u/Jim-Roberts-36" },
    paypal: { app: "https://paypal.me/JamesRoberts603182/40.00", web: "https://paypal.me/JamesRoberts603182/40.00" },
  });
});
it("omits links for missing handles", () => { expect(payLinks({}, 100)).toEqual({}); });
