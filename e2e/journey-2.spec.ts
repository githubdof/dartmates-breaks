import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { verifyInputs, type PublicInputs } from "../src/crypto/verify";
import { composeBreak, gotoReady, loginAs } from "./helpers";

const run = Date.now();

/** Every context `as()` opens, closed after each test. */
const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => c.close())); });

async function as(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const ctx = await browser.newContext();
  contexts.push(ctx);
  const page = await ctx.newPage();
  await loginAs(page, email, role);
  return page;
}

test("draft with a choice and 2nd place, edited and opened on straight fill; browse, claim, pay from My lines; draw; the result checks out", async ({ browser }) => {
  const hostHandle = `j2h${run}`;
  const host = await as(browser, `${hostHandle}@e2e.test`, "host");

  // 1. A draft: a choice for the top spot, a 2nd place, pick only.
  await host.goto("/host/new");
  await host.fill("input[name=title]", `J2 ${run}`);
  await host.locator("input[name=prize1]").first().fill("Chronos 22g");
  await host.getByRole("button", { name: "Add a choice" }).click();
  await host.locator("input[name=prize1]").nth(1).fill("Chronos 24g");
  await host.getByRole("button", { name: "Add 2nd place" }).click();
  await host.fill("input[name=prize2]", "Flight pack");
  await host.fill("input[name=lineCount]", "4");
  await host.fill("input[name=linePrice]", "5");
  await host.fill("input[name=venmo]", "@e2e-host");
  await host.getByRole("radio", { name: /^Pick only, no randoms/ }).check();
  await host.getByTestId("composer-draft").click();
  await host.waitForURL(/\/b\/[0-9a-f-]{36}$/);
  const url = host.url();

  // 2. Edit it: everything came back; switch to straight fill and open from the edit page.
  await host.getByTestId("edit-draft").click();
  await expect(host.locator("input[name=prize1]")).toHaveCount(2);
  await expect(host.locator("input[name=prize2]")).toHaveValue("Flight pack");
  await expect(host.getByRole("radio", { name: /^Pick only, no randoms/ })).toBeChecked();
  await host.getByRole("radio", { name: /^Straight fill/ }).check();
  await host.getByTestId("composer-open").click();
  await host.waitForURL(url);
  await host.locator("summary", { hasText: "Details" }).click();
  // These three lines are Plan A's prizeLines / pickingText copy: a task that changes that wording updates them here.
  await expect(host.getByText("Top spot gets a choice: Chronos 22g or Chronos 24g.").or(host.getByText("Top spot gets a choice: Chronos 24g or Chronos 22g."))).toBeVisible();
  await expect(host.getByText("2nd place gets Flight pack.")).toBeVisible();
  await expect(host.getByText("Straight fill. Lines go out in order.")).toBeVisible();

  // 3. Buyer A finds it in the feed, takes the next two lines, and pays later from My lines.
  const a = await as(browser, `j2a${run}@e2e.test`);
  await a.goto(`/breaks?host=${hostHandle}`);
  await a.getByTestId("break-card").filter({ hasText: `J2 ${run}` }).click();
  await a.waitForURL(url);
  await expect(a.getByTestId("cell-1")).toHaveAttribute("aria-disabled", "true"); // straight fill: no picking
  await a.getByRole("button", { name: "Increase Number of lines" }).click();
  await expect(a.getByTestId("claim-step")).toHaveText("Claim the next 2");
  await a.getByTestId("claim-step").click();
  await expect(a.getByTestId("pay-outcome")).toHaveText("You have lines 1 and 2.");
  await a.getByRole("button", { name: "I'll pay later" }).click();
  await a.goto("/me");
  const card = a.getByTestId("my-break").filter({ hasText: `J2 ${run}` });
  await expect(card.getByTestId("my-state")).toHaveText("Unpaid.");
  await card.getByTestId("how-to-pay").click();
  await expect(a.getByTestId("pay-amount")).toHaveText("Send $10 to @e2e-host");
  await a.getByTestId("pay-sent").click();
  await expect(card.getByTestId("my-state")).toHaveText(`Sent. ${hostHandle} will tick you off when it arrives.`);

  // 4. Buyer B takes the last two and marks them sent from the sheet.
  const b = await as(browser, `j2b${run}@e2e.test`);
  await gotoReady(b, url);
  await b.getByRole("button", { name: "Increase Number of lines" }).click();
  await expect(b.getByTestId("claim-step")).toHaveText("Claim the next 2");
  await b.getByTestId("claim-step").click();
  await expect(b.getByTestId("pay-outcome")).toHaveText("You have lines 3 and 4.");
  await b.getByTestId("pay-sent").click();
  await expect(b.getByTestId("pay-sheet")).toBeHidden();

  // 5. The host clears the waiting strip on /host, then runs the draw from the break's ledger.
  await host.goto("/host");
  await expect(host.getByTestId("waiting-strip")).toContainText("2 sent, waiting for you");
  await host.getByTestId("waiting-strip").click();
  const waiting = host.getByTestId("waiting-sheet");
  await waiting.getByTestId("ledger-paid").first().click();
  await expect(waiting.getByTestId("ledger-paid")).toHaveCount(1);
  await waiting.getByTestId("ledger-paid").click();
  await expect(waiting.getByTestId("ledger-paid")).toHaveCount(0);
  await expect(waiting.getByTestId("ledger-row")).toHaveCount(2);
  await waiting.getByRole("button", { name: "Close" }).click();
  await host.goto(url);
  await host.getByTestId("host-tools").click();
  await expect(host.getByTestId("paid-count")).toContainText("4 of 4 paid");
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("ledger-result").click();

  // 6. The result: the choice and 2nd place are named; the draw verifies in the browser and recomputes here.
  const final = host.locator("[data-reveal-final]");
  await expect(host.getByTestId("winner")).toContainText("Top spot: line", { timeout: 15_000 });
  await expect(final).toContainText("Picks one of the prize choices.");
  await expect(final).toContainText("2nd place: @");
  await expect(final).toContainText("Flight pack");
  await expect(host.getByTestId("verify-status")).toContainText("Checked");
  const inputs = (await (await host.request.get(`${url}/result.json`)).json()) as PublicInputs;
  expect(verifyInputs(inputs).ok).toBe(true);
  const tampered = verifyInputs({ ...inputs, ranking: [...inputs.ranking].reverse() });
  expect(tampered.ok).toBe(false);
  expect(tampered.reasons).toEqual(["ranking does not match the recomputation"]);
  // The Technical details fold shows the same result hash the recomputation just checked.
  await host.getByTestId("technical-details").locator("summary").click();
  await expect(host.getByLabel("Result hash")).toHaveValue(inputs.resultHash);

  // 7. The winner is told to pick.
  const top = Number(((await host.getByTestId("winner").textContent()) ?? "").match(/line (\d+)/)?.[1]);
  const winner = top <= 2 ? a : b;
  await winner.goto("/me");
  await expect(winner.getByTestId("my-break").filter({ hasText: `J2 ${run}` }).getByTestId("my-state")).toHaveText(`Won. Tell ${hostHandle} your choice.`);

  // 8. The result page for a first-time viewer: Skip hands focus to Replay, Replay deals again, Share falls back
  //    to a selectable field when the clipboard is blocked. A paused clock keeps the deal on screen: install() alone
  //    lets time run, and a 4-line deal ends in about 1.3 s, so Skip would race it (the layout spec's pattern).
  const viewer = a;
  await viewer.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("blocked")) } });
  });
  await viewer.clock.install();
  await viewer.clock.pauseAt(new Date(Date.now() + 1000));
  await viewer.goto(`${url}/result`);
  await viewer.getByTestId("reveal-skip").click();
  await expect(viewer.getByTestId("reveal-replay")).toBeFocused();
  await viewer.getByTestId("reveal-replay").click();
  await expect(viewer.getByTestId("reveal-skip")).toBeVisible();
  await viewer.getByTestId("share").click();
  await expect(viewer.getByLabel("Share text")).toHaveValue(/^CLOSED n RAN\. Top spot: line \d+, @/);
});

test("each picking mode offers its own controls", async ({ browser }) => {
  const host = await as(browser, `j2m${run}@e2e.test`, "host");
  const pickOrRandom = await composeBreak(host, { title: `Modes A ${run}`, lineCount: 6, mode: "Pick or random" });
  const pickOnly = await composeBreak(host, { title: `Modes B ${run}`, lineCount: 6, mode: "Pick only, no randoms" });
  const straight = await composeBreak(host, { title: `Modes C ${run}`, lineCount: 6, mode: "Straight fill" });
  const buyer = await as(browser, `j2p${run}@e2e.test`);

  await gotoReady(buyer, pickOrRandom);
  await expect(buyer.getByTestId("claim-step")).toHaveText("Claim 1 random");
  await expect(buyer.getByTestId("cell-1")).not.toHaveAttribute("aria-disabled", "true");
  await buyer.getByTestId("claim-step").click();
  await expect(buyer.getByTestId("pay-outcome")).toHaveText(/^You have line \d\.$/);
  await buyer.getByRole("button", { name: "I'll pay later" }).click();

  await gotoReady(buyer, pickOnly);
  await expect(buyer.getByTestId("claim-step")).toHaveCount(0);
  await buyer.getByTestId("cell-4").click();
  await expect(buyer.getByTestId("bar-summary")).toHaveText("Line 4, $5");

  await buyer.goto(straight);
  await expect(buyer.getByTestId("cell-1")).toHaveAttribute("aria-disabled", "true");
  await expect(buyer.getByTestId("claim-step")).toHaveText("Claim the next line");
});
