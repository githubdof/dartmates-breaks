import type { Browser, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

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

/** A distinct, deterministic solid 800 × 600 JPEG per `n`. */
export async function jpeg(n: number): Promise<Buffer> {
  return sharp({ create: { width: 800, height: 600, channels: 3, background: { r: (n * 53) % 256, g: (n * 97) % 256, b: (n * 151) % 256 } } })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** /host/new filled (title, top spot and its condition, handle, lines, price), `photos` JPEGs attached through the
 *  strip and waited for until ready, then Open break (or Save draft); returns the break's URL. */
export async function composeBreakWithPhotos(page: Page, o: { title: string; photos: number; lineCount?: number; price?: string; intent?: "open" | "draft" }): Promise<string> {
  // Hydrated first: a file set before React attaches its handler would be ignored.
  await gotoReady(page, "/host/new");
  await page.fill("input[name=title]", o.title);
  await page.fill("input[name=prize1]", "Chronos 22g");
  await page.selectOption("select[name=prize1Condition]", "new_in_box");
  await page.fill("input[name=venmo]", "@e2e-host");
  await page.fill("input[name=lineCount]", String(o.lineCount ?? 4));
  await page.fill("input[name=linePrice]", o.price ?? "5");
  const files = await Promise.all(
    Array.from({ length: o.photos }, async (_, i) => ({ name: `p${i + 1}.jpg`, mimeType: "image/jpeg", buffer: await jpeg(i + 1) })),
  );
  await page.getByTestId("photo-input").setInputFiles(files);
  // Counts ready tiles in the page (no `expect`, so vitest can load this file without Playwright's runner).
  await page.waitForFunction(
    (n) => document.querySelectorAll('[data-testid="photo-tile"][data-status="ready"]').length === n,
    o.photos,
    { timeout: 120_000 }, // up to 8 shrink + upload + finalise cycles, two at a time
  );
  await page.getByTestId(o.intent === "draft" ? "composer-draft" : "composer-open").click();
  await page.waitForURL(/\/b\/[0-9a-f-]{36}$/);
  return page.url();
}

/** A signed-in page in its own browser context. */
export async function signedIn(browser: Browser, email: string, role: "member" | "host" = "member"): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, email, role);
  return page;
}

/** A 2-line break the host runs to the end, for the result page: one buyer takes both lines and is ticked paid.
 *  With `photos` it is composed with that many photos. Each call makes its own buyer. */
export async function ranBreak(browser: Browser, host: Page, o: { photos?: number } = {}): Promise<{ url: string; buyer: Page }> {
  const stamp = Date.now();
  const title = `Layout ran ${stamp}`;
  const ranUrl = o.photos ? await composeBreakWithPhotos(host, { title, lineCount: 2, photos: o.photos }) : await composeBreak(host, { title, lineCount: 2 });
  const buyer = await signedIn(browser, `lr${stamp}@e2e.test`);
  await gotoReady(buyer, ranUrl);
  await buyer.getByTestId("claim-rest").click();
  await buyer.locator('[data-testid="pay-amount"]:has-text("$10")').waitFor();
  await host.goto(ranUrl);
  await host.getByTestId("host-tools").click();
  await host.getByTestId("ledger-paid").click();
  await host.getByTestId("run-draw").click();
  await host.getByTestId("finish-draw").click();
  await host.getByTestId("ledger-result").waitFor();
  return { url: ranUrl, buyer };
}

export async function axeViolations(page: Page, where: string): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return r.violations.map((v) => `${where} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}
