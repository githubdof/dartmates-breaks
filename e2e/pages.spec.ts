import { test, expect, type Browser, type Page } from "@playwright/test";
import { composeBreak, loginAs } from "./helpers";

// One test per page Plan B adds. Each test makes its own users and breaks; `run` keeps them unique per run.
const run = Date.now();

async function as(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, email, role);
  return page;
}

test("a member edits their display name and payment name in /account", async ({ browser }) => {
  const page = await as(browser, `acct${run}@e2e.test`);
  await page.getByTestId("account-link").click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(`@acct${run}`, { exact: true })).toBeVisible();
  await page.getByLabel("Display name").fill("Acct Person");
  await page.getByLabel("Name on your payments").fill("Jon  Payer");
  await page.getByTestId("account-save").click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Display name")).toHaveValue("Acct Person");
  await expect(page.getByLabel("Name on your payments")).toHaveValue("Jon Payer");
});

test("a host saves a draft and edits it; nobody else can see either page", async ({ browser }) => {
  const host = await as(browser, `dh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Draft ${run}`, intent: "draft" });
  const id = url.split("/b/")[1];
  await host.getByTestId("edit-draft").click();
  await host.waitForURL(new RegExp(`/host/${id}/edit$`));
  await expect(host.locator("input[name=title]")).toHaveValue(`Draft ${run}`);
  await host.fill("input[name=title]", `Edited ${run}`);
  await host.getByTestId("composer-draft").click();
  await host.waitForURL(url);
  await expect(host.getByRole("heading", { level: 1 })).toHaveText(`Edited ${run}`);
  const stranger = await as(browser, `ds${run}@e2e.test`);
  expect((await stranger.goto(url))?.status()).toBe(404);
  expect((await stranger.goto(`/host/${id}/edit`))?.status()).toBe(404);
});

test("the handle check answers signed-in callers with taken or free, and nobody else", async ({ browser }) => {
  const taken = await as(browser, `hk${run}@e2e.test`);
  const me = await as(browser, `hm${run}@e2e.test`);
  const ask = async (h: string) => (await me.request.get(`/api/handle?h=${encodeURIComponent(h)}`)).json();
  expect(await ask(`hk${run}`)).toEqual({ state: "taken" });
  expect(await ask(`HK${run}`)).toEqual({ state: "taken" });
  expect(await ask(`hm${run}`)).toEqual({ state: "free" });
  expect(await ask("admin")).toEqual({ state: "invalid", message: "That handle is reserved" });
  const anon = await (await browser.newContext()).request.get(`/api/handle?h=hk${run}`);
  expect(anon.status()).toBe(401);
  await taken.close();
});

test("the feed lists an open break and never a draft; the host filter and sorts live in the URL", async ({ browser }) => {
  const handle = `fh${run}`;
  const host = await as(browser, `${handle}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Feed open ${run}` });
  await composeBreak(host, { title: `Feed draft ${run}`, intent: "draft" });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/breaks?host=${handle}`);
  const card = visitor.getByTestId("break-card").filter({ hasText: `Feed open ${run}` });
  await expect(card).toContainText("4 of 4 left");
  await expect(card).toContainText("$5 a line");
  await expect(card).toContainText(`Hosted by @${handle}. New host.`);
  await expect(visitor.getByText(`Feed draft ${run}`)).toHaveCount(0);
  await expect(visitor.getByTestId("host-filter")).toHaveValue(handle);
  await visitor.getByRole("radio", { name: "Almost full" }).click();
  await expect(visitor).toHaveURL(new RegExp(`/breaks\\?sort=almost&host=${handle}$`));
  await expect(visitor.getByRole("radio", { name: "Almost full" })).toHaveAttribute("aria-checked", "true");
  await card.click();
  await expect(visitor).toHaveURL(url);
  await visitor.getByTestId("host-line").click();
  await expect(visitor).toHaveURL(new RegExp(`/h/${handle}$`));
  // A host with nothing open: the empty state points at every open break.
  await visitor.goto(`/breaks?host=nobody_here_x`);
  await expect(visitor.getByTestId("feed-empty")).toContainText("@nobody_here_x has no open breaks right now.");
  await visitor.getByRole("link", { name: "See all open breaks" }).click();
  await expect(visitor).toHaveURL(/\/breaks$/);
});

test("a host profile shows public figures, the open breaks and a past count, and nothing private", async ({ browser }) => {
  const handle = `ph${run}`;
  const host = await as(browser, `${handle}@e2e.test`, "host");
  await composeBreak(host, { title: `Profile open ${run}` });
  await composeBreak(host, { title: `Profile draft ${run}`, intent: "draft" });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/h/${handle}`);
  await expect(visitor.getByRole("heading", { level: 1 })).toHaveText(`@${handle}`);
  await expect(visitor.getByTestId("profile-trust")).toHaveText("New host. No breaks run yet.");
  await expect(visitor.getByTestId("profile-since")).toContainText("On Breaks since");
  await expect(visitor.getByTestId("break-card")).toHaveCount(1);
  await expect(visitor.getByText(`Profile draft ${run}`)).toHaveCount(0);
  await expect(visitor.getByTestId("profile-past")).toHaveText("No past breaks yet.");
  await expect(visitor.getByText("@e2e.test")).toHaveCount(0);
  await expect(visitor.getByText("e2e-host")).toHaveCount(0);
  expect((await visitor.goto("/h/nobody_here_x"))?.status()).toBe(404);
});

test("the landing page leads with the newest ran break and links to the feed", async ({ browser }) => {
  // nh/nb, not lh/lb: those are the layout spec's host and buyer prefixes, and both files key handles on Date.now().
  const host = await as(browser, `nh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Hero ${run}`, lineCount: 2 });
  const buyer = await as(browser, `nb${run}@e2e.test`);
  await buyer.goto(url);
  await buyer.getByTestId("claim-rest").click();
  await expect(buyer.getByTestId("pay-amount")).toContainText("$10");
  await host.reload();
  await host.getByTestId("host-tools").click();
  await host.getByTestId("ledger-paid").click();
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await expect(host.getByTestId("ledger-result")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto("/");
  const hero = visitor.getByTestId("hero");
  await expect(hero).toContainText(`Hero ${run}`);
  await expect(hero).toContainText("Anyone can check the draw.");
  await expect(hero).toHaveAttribute("href", `${new URL(url).pathname}/result`);
  await expect(visitor.getByText("Hosting on Facebook now? Breaks is invite-only for hosts.", { exact: true })).toBeVisible();
  await visitor.getByTestId("browse-breaks").click();
  await expect(visitor).toHaveURL(/\/breaks$/);
});

test("My lines shows what a buyer holds, reopens the pay block, and gives lines back", async ({ browser }) => {
  const host = await as(browser, `mh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Mine ${run}`, lineCount: 6 });
  const buyer = await as(browser, `mb${run}@e2e.test`);
  await expect(buyer.getByRole("link", { name: "My lines" })).toBeVisible(); // members get the tab bar now
  await buyer.goto(url);
  await buyer.getByTestId("cell-2").click();
  await buyer.getByTestId("cell-3").click();
  await buyer.getByTestId("claim-submit").click();
  await expect(buyer.getByTestId("pay-sheet")).toBeVisible();
  await buyer.getByRole("button", { name: "I'll pay later" }).click();

  await buyer.goto("/me"); // the break page hides the tab bar (one bar at the bottom)
  const card = buyer.getByTestId("my-break").filter({ hasText: `Mine ${run}` });
  await expect(card.getByTestId("my-state")).toHaveText("Unpaid.");
  await expect(card.getByTestId("my-owed")).toContainText("You owe $10.");
  await card.getByTestId("how-to-pay").click();
  await expect(buyer.getByTestId("pay-amount")).toHaveText("Send $10 to @e2e-host");
  await buyer.getByTestId("pay-sent").click();
  await expect(buyer.getByTestId("pay-sheet")).toBeHidden();
  await expect(card.getByTestId("my-state")).toHaveText(`Sent. mh${run} will tick you off when it arrives.`);

  await buyer.goto(url);
  await buyer.getByTestId("cell-5").click();
  await buyer.getByTestId("claim-submit").click();
  await buyer.getByRole("button", { name: "I'll pay later" }).click();
  await buyer.goto("/me");
  await card.getByTestId("give-back").click();
  await expect(card).toContainText("Give back line 5? It goes back on the board.");
  await card.getByTestId("give-back-yes").click();
  await expect(card.getByTestId("my-note")).toHaveText("Gave back line 5.");
  await expect(card.getByTestId("my-owed")).toHaveCount(0);
});

test("/host groups breaks by state; the waiting strip marks sent lines paid in place, with Undo, without moving rows", async ({ browser }) => {
  const host = await as(browser, `wh${run}@e2e.test`, "host");
  const first = await composeBreak(host, { title: `Wait A ${run}` });
  const second = await composeBreak(host, { title: `Wait B ${run}` });
  await composeBreak(host, { title: `Wait draft ${run}`, intent: "draft" });
  const buyer = await as(browser, `wb${run}@e2e.test`);
  for (const url of [first, second]) {
    await buyer.goto(url);
    await buyer.getByTestId("cell-1").click();
    await buyer.getByTestId("claim-submit").click();
    await buyer.getByTestId("pay-sent").click();
    await expect(buyer.getByTestId("pay-sheet")).toBeHidden();
  }
  await host.goto("/host");
  await expect(host.getByTestId("group-open")).toContainText(`Wait A ${run}`);
  await expect(host.getByTestId("group-draft")).toContainText(`Wait draft ${run}`);
  await expect(host.getByTestId("waiting-strip")).toContainText("2 sent, waiting for you, across 2 breaks");
  await expect(host.getByTestId("waiting-strip")).toContainText("Review");
  await host.getByTestId("waiting-strip").click();
  const sheet = host.getByTestId("waiting-sheet");
  const rows = sheet.getByTestId("ledger-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`Wait A ${run}`); // oldest sent first
  // Paid, then Undo: the row comes back to Paid, in the same place.
  await sheet.getByTestId("ledger-paid").first().click();
  await expect(sheet.getByTestId("ledger-undo")).toBeVisible();
  await expect(sheet.getByRole("status").filter({ hasText: `Marked @wb${run} paid (1 line, $5).` })).toBeVisible();
  await sheet.getByTestId("ledger-undo").click();
  await expect(sheet.getByTestId("ledger-paid")).toHaveCount(2);
  // Paid for real: the row stays put, showing Paid.
  await sheet.getByTestId("ledger-paid").first().click();
  await expect(sheet.getByTestId("ledger-paid")).toHaveCount(1);
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`Wait A ${run}`);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(host.getByTestId("waiting-strip")).toContainText("1 sent, waiting for you");
});

test("every visible break has a link-preview image; a draft's 404s even for its host", async ({ browser }) => {
  const host = await as(browser, `oh${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Preview ${run}` });
  const draft = await composeBreak(host, { title: `Preview draft ${run}`, intent: "draft" });
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(url);
  await expect(visitor.locator('meta[property="og:image"]')).toHaveAttribute("content", `${url}/og`);
  await expect(visitor.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  const img = await visitor.request.get(`${url}/og`);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/png");
  expect(img.headers()["cache-control"]).toBe("public, max-age=300, s-maxage=300");
  // The PNG's IHDR chunk: width, then height, as big-endian 32-bit integers at bytes 16 and 20.
  const png = await img.body();
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630]);
  expect((await host.request.get(`${draft}/og`)).status()).toBe(404);
  await visitor.context().close();
  await host.context().close();
});
