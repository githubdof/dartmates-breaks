import { test, expect, type Browser } from "@playwright/test";
import { loginAs } from "./helpers";

async function newContext(browser: Browser, email: string, role: "member" | "host" = "member") {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, email, role);
  return page;
}

test("host opens, buyers claim and pay, host draws, result verifies", async ({ browser }) => {
  const run = Date.now();
  const host = await newContext(browser, `host${run}@e2e.test`, "host");
  await host.goto("/host/new");
  await host.fill("input[name=title]", "E2E Chronos");
  await host.fill("input[name=prize1]", "Chronos 22g");
  await host.fill("input[name=venmo]", "@e2e-host");
  await host.fill("input[name=lineCount]", "3");
  await host.fill("input[name=linePrice]", "5");
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await expect(alice.getByTestId("bar-summary")).toHaveText("Lines 1, 2, $10");
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("pay-outcome")).toHaveText("You have lines 1 and 2.");
  await expect(alice.getByTestId("pay-amount")).toContainText("$10");
  await alice.getByTestId("pay-sent").click();
  await expect(alice.getByTestId("sent-note")).toBeVisible();

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.getByTestId("claim-rest").click();
  await expect(bob.getByTestId("pay-amount")).toContainText("$5");

  await host.reload(); // pick up claims made in the other contexts
  await host.getByTestId("host-tools").click();
  await expect(host.locator("[data-testid=ledger-row][data-status=sent]")).toHaveCount(1);
  const paid = host.getByTestId("ledger-paid");
  await expect(paid).toHaveCount(2); // one per buyer with unpaid lines
  await paid.first().click();
  await expect(paid).toHaveCount(1); // the row stays, showing Paid and Undo
  await expect(host.getByTestId("ledger-undo")).toHaveCount(1);
  await paid.first().click();
  await expect(paid).toHaveCount(0);
  await expect(host.getByTestId("paid-count")).toContainText("3 of 3 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("ledger-result").click();
  await expect(host.getByTestId("winner")).toContainText("Top spot: line", { timeout: 15_000 }); // server-rendered (text is present even while the deal hides it)
  await expect(host.getByTestId("verify-status")).toContainText("Checked"); // runs on load
  await host.getByTestId("verify-fold").click();
  await host.getByTestId("verify-run").click();
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
});
