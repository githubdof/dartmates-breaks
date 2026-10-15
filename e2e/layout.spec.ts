import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoReady, loginAs } from "./helpers";

// The design's layout and accessibility claims, checked in a real browser (no jsdom). One 50-line open break
// serves the whole file; it is created through the composer exactly as journey-1 creates its break.
test.describe.configure({ mode: "serial" });

const run = Date.now();
const hostEmail = `lh${run}@e2e.test`;
const buyerHandle = `lb${run}`; // /test/login derives the handle from the email's local part
let url = "";

async function signedIn(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, email, role);
  return page;
}

async function anonymous(browser: Browser, width: number, height: number): Promise<Page> {
  const mobile = width < 640;
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  return ctx.newPage();
}

test.beforeAll(async ({ browser }) => {
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto("/host/new");
  await host.fill("input[name=title]", "Layout fifty");
  await host.fill("input[name=prize1]", "Chronos 22g");
  await host.fill("input[name=venmo]", "@e2e-host");
  await host.fill("input[name=lineCount]", "50");
  await host.fill("input[name=linePrice]", "5");
  await host.getByTestId("composer-open").click();
  await host.waitForURL(/\/b\//);
  url = host.url();
  // A buyer claims two lines, so the grid has taken cells whose holder the server must withhold from strangers.
  const buyer = await signedIn(browser, `${buyerHandle}@e2e.test`);
  await buyer.goto(url);
  await buyer.getByTestId("cell-3").click();
  await buyer.getByTestId("cell-9").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("owed")).toBeVisible();
});

test("the whole 50-line grid and the legend sit above the claim bar at 390 × 664 (D§5.4)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  const legend = await page.getByTestId("legend").boundingBox();
  const bar = await page.locator("[data-sticky-bar]").boundingBox();
  expect(legend).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(legend!.y + legend!.height).toBeLessThanOrEqual(bar!.y);
});

test("at 360 × 640 the legend sits at the fold (D§5.4)", async ({ browser }) => {
  const page = await anonymous(browser, 360, 640);
  await page.goto(url);
  const legend = await page.getByTestId("legend").boundingBox();
  expect(legend).not.toBeNull();
  expect(legend!.y).toBeLessThanOrEqual(640);
});

test("the bar counts open lines as 'N to go' beside the action, and the media row reads '50 lines, $5 a line' (Mosaic §8)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  await expect(page.getByTestId("media-row")).toHaveText("50 lines, $5 a line");
  const toGo = page.getByTestId("to-go");
  await expect(toGo).toHaveText(/^\d+ to go$/);
  const n = Number((await toGo.textContent())!.split(" ")[0]);
  await expect(page.getByRole("group", { name: `Lines, ${n} to go` })).toBeVisible();
  await expect(page.getByTestId("bar-meta")).toContainText("Open");
  await expect(page.getByText(/of 50 left/)).toHaveCount(0);
  await expect(page.getByText("You hold", { exact: false })).toHaveCount(0);
});

test("a holder's 'You have …' line sits under the legend and above the bar at 390 × 664 (Mosaic §8)", async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true })).newPage();
  await loginAs(page, `${buyerHandle}@e2e.test`);
  await page.goto(url);
  const line = page.getByTestId("you-have");
  await expect(line).toHaveText("You have 3 and 9.");
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
  const box = await line.boundingBox();
  const bar = await page.locator("[data-sticky-bar]").boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(legend!.y + legend!.height);
  expect(box!.y + box!.height).toBeLessThanOrEqual(bar!.y);
});

for (const [width, cols] of [[390, 8], [360, 7], [320, 6], [1024, 10]] as const) {
  test(`shows ${cols} grid columns at ${width} wide (D§4)`, async ({ browser }) => {
    const page = await anonymous(browser, width, 800);
    await page.goto(url);
    const n = await page.locator("[data-grid-rows]").first()
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    expect(n).toBe(cols);
  });
}

test("theme-color is the wall on wall routes and paper elsewhere (Mosaic §8)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  // Each wall route joins this list in the task that puts it on the wall (Task 8, Task 15a, Task 15b; the result page's wall theme color is checked in journey 2 by Task 13; recorded ruling 12).
  const wall: string[] = [url];
  for (const path of wall) {
    await page.goto(path);
    await expect(page.locator('meta[name="theme-color"]'), path).toHaveAttribute("content", "#17161A");
  }
  for (const path of ["/legal/draw", "/login", ...["/", "/breaks", url, `/h/lh${run}`].filter((p) => !wall.includes(p))]) {
    await page.goto(path);
    await expect(page.locator('meta[name="theme-color"]'), path).toHaveAttribute("content", "#F6F5F1");
  }
});

test("an anonymous viewer's cell names never carry a handle (D§4)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  const names = await page.locator("button[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(50);
  expect(names.filter((n) => n.includes(buyerHandle) || n.includes("@"))).toEqual([]);
  expect(names[2]).toBe("Line 3, taken");
  // Mosaic §6: a kit-view cell renders no data-flight and no --fc custom property.
  await expect(page.getByRole("group", { name: /^Lines/ })).toHaveAttribute("data-view", "kit");
  expect(await page.locator("[data-flight]").count()).toBe(0);
  const styles = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
  expect(styles.filter((s) => s.includes("--fc"))).toEqual([]);
});

test("a signed-in viewer with no line here sees no flight and no handle either (Mosaic §6)", async ({ browser }) => {
  const page = await signedIn(browser, `lq${run}@e2e.test`);
  await page.goto(url);
  const names = await page.locator("button[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names.filter((n) => n.includes(buyerHandle) || n.includes("@"))).toEqual([]);
  await expect(page.getByRole("group", { name: /^Lines/ })).toHaveAttribute("data-view", "kit");
  expect(await page.locator("[data-flight]").count()).toBe(0);
  const styles = await page.locator("[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("style") ?? ""));
  expect(styles.filter((s) => s.includes("--fc"))).toEqual([]);
});

test("Escape closes the pay sheet and focus lands on the claim bar (D§7)", async ({ browser }) => {
  const page = await signedIn(browser, `lf${run}@e2e.test`);
  await page.goto(url);
  await page.getByTestId("cell-20").click();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pay-sheet")).toBeHidden();
  // Polled: if Escape lands while the claim is still resolving, the island hands focus to the bar once it settles.
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("[data-sticky-bar]"))).toBe(true);
});

test("the pay sheet's pay block says 'Pay within 24 hours.' while the break is open (Mosaic §8)", async ({ browser }) => {
  const page = await signedIn(browser, `lw${run}@e2e.test`);
  await page.goto(url);
  await page.getByTestId("cell-44").click();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  await expect(page.getByTestId("pay-within")).toHaveText(/^Pay within \d+ hours?\.$/);
});

test("a failed 'I've sent it' reports inside the pay sheet, not behind it", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Fake timers, paused once the break page is up: the 20 s auto-refresh must not land mid-test and
  // replace the owe this test is about to make stale.
  await page.clock.install();
  await loginAs(page, `lg${run}@e2e.test`);
  await page.goto(url);
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.getByTestId("cell-21").click();
  await page.getByTestId("claim-submit").click();
  // The paused clock also holds the page's own timers: the sheet opens at the last landing or at 400 ms (Mosaic §7
  // Claim commits), so let the claim land (the owed button is the answer) and run the clock past that bound.
  await expect(page.getByTestId("owed")).toBeVisible();
  await page.clock.runFor(400);
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  // The same buyer gives the line back from a second browser context with the same session, so marking it sent
  // must now fail. A second tab in the same context took focus from `page`, and the visibility change could fire
  // the auto-refresh, which replaced the owe this test makes stale (the flake).
  const other = await (await browser.newContext({ storageState: await ctx.storageState() })).newPage();
  await other.goto(url);
  await other.getByTestId("owed").click();
  await other.getByRole("button", { name: "Give back these lines" }).click();
  await other.getByTestId("give-back-confirm").click();
  await expect(other.getByTestId("pay-sheet")).toBeHidden();
  await other.context().close();
  // The failure refreshes the page's props and the given-back owe clears; the alert stays in the open sheet.
  await page.getByTestId("pay-sent").click();
  const alert = page.getByTestId("pay-sheet").getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText("Those lines aren't yours or are already paid");
  await ctx.close();
});

test("on My lines, a refused 'I've sent it' whose card leaves still says why, at the top of the page", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, `lm${run}@e2e.test`);
  await gotoReady(page, url);
  await page.getByTestId("cell-30").click();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  await gotoReady(page, "/me");
  await page.getByTestId("my-break").getByTestId("how-to-pay").click();
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  // The same buyer gives back every line in that break from a second context, so the card has nothing left to show.
  const other = await (await browser.newContext({ storageState: await ctx.storageState() })).newPage();
  await gotoReady(other, url);
  await other.getByTestId("owed").click();
  await other.getByRole("button", { name: "Give back these lines" }).click();
  await other.getByTestId("give-back-confirm").click();
  await expect(other.getByTestId("pay-sheet")).toBeHidden();
  await other.context().close();
  await page.getByTestId("pay-sent").click();
  await expect(page.getByTestId("me-note")).toHaveText("Those lines aren't yours or are already paid");
  await expect(page.getByTestId("my-break")).toHaveCount(0);
  await ctx.close();
});

test("a claim whose request never arrives keeps the buyer on the board with a note (I2)", async ({ browser }) => {
  const page = await signedIn(browser, `ln${run}@e2e.test`);
  await page.goto(url);
  // Drop server-action POSTs (they carry a Next-Action header); the refresh that follows is a GET and goes through.
  await page.route("**/*", (route) =>
    route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort("internetdisconnected") : route.continue());
  await page.getByTestId("cell-25").click();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("bar-note")).toHaveText("Couldn't reach Breaks. Check your connection; the board is refreshed.");
  await expect(page.getByTestId("cell-1")).toBeVisible(); // still the break, not an error page
  await expect(page.getByText("Application error")).toHaveCount(0);
});

test("focusing the ledger search hides the claim bar (D§5.1)", async ({ browser }) => {
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto(url);
  await expect(host.locator("[data-sticky-bar]")).toBeVisible(); // a 50-line break: the host may hold 5, so the bar shows
  await host.getByTestId("host-tools").click();
  await host.getByPlaceholder("Name, handle or amount").focus();
  await expect(host.locator("[data-sticky-bar]")).toBeHidden();
});

test("Enter in the composer never opens a break", async ({ browser }) => {
  const host = await signedIn(browser, `en${run}@e2e.test`, "host");
  await host.goto("/host/new");
  await host.fill("input[name=title]", "Enter safety");
  await host.fill("input[name=prize1]", "Chronos 22g");
  await host.fill("input[name=venmo]", "@e2e-host");
  await host.locator("input[name=title]").press("Enter");
  await host.waitForURL(/\/b\//);
  await expect(host.getByTestId("composer-open")).toHaveCount(0);
  await expect(host.getByText("Draft", { exact: true }).first()).toBeVisible();
  await expect(host.getByTestId("edit-draft")).toBeVisible();
});

async function axeViolations(page: Page, where: string): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("axe finds no WCAG 2.1 A or AA violation on the main pages, the pay sheet and the ledger (D§7)", async ({ browser }) => {
  const found: string[] = [];
  const anon = await anonymous(browser, 390, 664);
  for (const path of ["/", "/breaks", url, `/h/lh${run}`, "/legal/draw"]) {
    await anon.goto(path);
    found.push(...(await axeViolations(anon, `anonymous ${path}`)));
  }
  const buyer = await signedIn(browser, `${buyerHandle}@e2e.test`);
  for (const path of ["/me", "/account"]) {
    await buyer.goto(path);
    found.push(...(await axeViolations(buyer, `buyer ${path}`)));
  }
  await buyer.goto(url);
  await buyer.getByTestId("owed").click();
  await expect(buyer.getByTestId("pay-sheet")).toBeVisible();
  found.push(...(await axeViolations(buyer, "buyer pay sheet")));
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto("/host");
  found.push(...(await axeViolations(host, "host /host")));
  await host.goto(url);
  await host.getByTestId("host-tools").click();
  await expect(host.getByTestId("ledger")).toBeVisible();
  found.push(...(await axeViolations(host, "host ledger")));
  expect(found).toEqual([]);
});
