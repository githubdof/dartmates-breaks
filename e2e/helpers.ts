import type { Page } from "@playwright/test";

export async function loginAs(page: Page, email: string, role: "member" | "host" = "member") {
  await page.goto(`/test/login?email=${encodeURIComponent(email)}&role=${role}&secret=e2e`);
  await page.waitForURL("/");
}

/** A page load, then React's hydration (the root layout marks `html[data-hydrated]`): a click before it can do nothing. */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

export type PickingMode = "Pick or random" | "Pick only, no randoms" | "Straight fill";

/** Fills /host/new as a signed-in host and submits it; returns the break's URL. */
export async function composeBreak(page: Page, o: { title: string; lineCount?: number; price?: string; intent?: "open" | "draft"; mode?: PickingMode }): Promise<string> {
  await page.goto("/host/new");
  await page.fill("input[name=title]", o.title);
  await page.fill("input[name=prize1]", "Chronos 22g");
  await page.selectOption("select[name=prize1Condition]", "new_in_box");
  await page.fill("input[name=venmo]", "@e2e-host");
  await page.fill("input[name=lineCount]", String(o.lineCount ?? 4));
  await page.fill("input[name=linePrice]", o.price ?? "5");
  if (o.mode) await page.getByRole("radio", { name: new RegExp(`^${o.mode}`) }).check();
  await page.getByTestId(o.intent === "draft" ? "composer-draft" : "composer-open").click();
  await page.waitForURL(/\/b\/[0-9a-f-]{36}$/);
  return page.url();
}
