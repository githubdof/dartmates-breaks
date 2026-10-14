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
