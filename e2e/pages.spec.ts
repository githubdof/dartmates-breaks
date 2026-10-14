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
