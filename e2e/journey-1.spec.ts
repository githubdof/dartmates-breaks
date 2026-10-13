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
  await host.fill("textarea[name=items]", "Chronos 22g");
  await host.fill("input[name=lineCount]", "3");
  await host.fill("input[name=linePrice]", "5");
  await host.click("text=Post break");
  await host.waitForURL(/\/b\//);
  const url = host.url();

  const alice = await newContext(browser, `alice${run}@e2e.test`);
  await alice.goto(url);
  const claim = alice.locator("section", { has: alice.getByRole("heading", { name: "Claim lines" }) });
  await claim.getByRole("button", { name: "1", exact: true }).click();
  await claim.getByRole("button", { name: "2", exact: true }).click();
  await claim.getByRole("button", { name: "Claim 2" }).click();
  await expect(alice.getByText("You owe $10.00")).toBeVisible();
  await alice.click("text=I've sent payment");

  const bob = await newContext(browser, `bob${run}@e2e.test`);
  await bob.goto(url);
  await bob.click("button:has-text('Take the rest')");
  await expect(bob.getByText("You owe $5.00")).toBeVisible();

  await host.reload(); // pick up claims made in the other contexts
  await expect(host.getByText("· sent")).toBeVisible();
  const paidButtons = host.locator("button:has-text('Paid')");
  await expect(paidButtons).toHaveCount(2); // one per buyer
  await paidButtons.first().click();
  await expect(host.locator("button:has-text('Paid')")).toHaveCount(1);
  await host.locator("button:has-text('Paid')").first().click();
  await expect(host.locator("button:has-text('Paid')")).toHaveCount(0);
  await expect(host.getByText("3 paid")).toBeVisible();
  await host.click("text=Run draw");
  await expect(host.getByText("Finish draw")).toBeVisible();
  await host.click("text=Finish draw");
  await expect(host.getByText("See the result")).toBeVisible();
  await host.click("text=See the result");
  await expect(host.getByText("Winner")).toBeVisible({ timeout: 15_000 });
  await expect(host.getByTestId("verify-status")).toContainText("Checked ✓"); // runs on load
  await host.click("text=Check it yourself");
  await expect(host.getByTestId("verify-status")).toContainText("Checked ✓");
});
