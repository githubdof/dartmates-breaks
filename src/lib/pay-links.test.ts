import { it, expect } from "vitest";
import { payLinks } from "./pay-links";
it("builds venmo and paypal deep links with the amount and an empty note", () => {
  expect(payLinks({ venmo: "@Jim-Roberts-36", paypal: "JamesRoberts603182" }, 4000)).toEqual({
    venmo: "venmo://paycharge?txn=pay&recipients=Jim-Roberts-36&amount=40.00&note=",
    paypal: "https://paypal.me/JamesRoberts603182/40.00",
  });
});
it("omits links for missing handles", () => { expect(payLinks({}, 100)).toEqual({}); });
