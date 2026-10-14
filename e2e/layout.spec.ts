import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

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
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
  const bar = await page.locator("[data-sticky-bar]").boundingBox();
  expect(legend).not.toBeNull();
  expect(bar).not.toBeNull();
  expect(legend!.y + legend!.height).toBeLessThanOrEqual(bar!.y);
});

test("at 360 × 640 the legend sits at the fold (D§5.4)", async ({ browser }) => {
  const page = await anonymous(browser, 360, 640);
  await page.goto(url);
  const legend = await page.getByRole("list", { name: "What the cells mean" }).boundingBox();
  expect(legend).not.toBeNull();
  expect(legend!.y).toBeLessThanOrEqual(640);
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

test("an anonymous viewer's cell names never carry a handle (D§4)", async ({ browser }) => {
  const page = await anonymous(browser, 390, 664);
  await page.goto(url);
  const names = await page.locator("button[data-cell]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(50);
  expect(names.filter((n) => n.includes(buyerHandle) || n.includes("@"))).toEqual([]);
  expect(names[2]).toBe("Line 3, taken");
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

test("a failed 'I've sent it' reports inside the pay sheet, not behind it", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, `lg${run}@e2e.test`);
  await page.goto(url);
  await page.getByTestId("cell-21").click();
  await page.getByTestId("claim-submit").click();
  await expect(page.getByTestId("pay-sheet")).toBeVisible();
  // The same buyer gives the line back from a second tab, so marking it sent must now fail.
  const other = await ctx.newPage();
  await other.goto(url);
  await other.getByTestId("owed").click();
  await other.getByRole("button", { name: "Give back these lines" }).click();
  await other.getByTestId("give-back-confirm").click();
  await expect(other.getByTestId("pay-sheet")).toBeHidden();
  await page.getByTestId("pay-sent").click();
  await expect(page.getByTestId("pay-sheet").getByRole("alert")).toBeVisible();
});

test("focusing the ledger search hides the claim bar (D§5.1)", async ({ browser }) => {
  const host = await signedIn(browser, hostEmail, "host");
  await host.goto(url);
  await expect(host.locator("[data-sticky-bar]")).toBeVisible(); // a 50-line break: the host may hold 5, so the bar shows
  await host.getByTestId("host-tools").click();
  await host.getByPlaceholder("Name, handle or amount").focus();
  await expect(host.locator("[data-sticky-bar]")).toBeHidden();
});
