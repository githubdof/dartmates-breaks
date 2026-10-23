import { expect, type Page } from "@playwright/test";
import { gotoReady, jpeg } from "./helpers";
import { withDb } from "./db";

/** Sets the strip's file input to `p${n}.jpg` for each `n` and waits until every tile is ready (the new ones included). */
export async function addPhotos(page: Page, ns: number[]): Promise<void> {
  // The strip in the Edit photos sheet loads on the first open: count its tiles only once it is there.
  await page.getByTestId("photo-strip").waitFor();
  const tiles = page.getByTestId("photo-tile");
  const before = await tiles.count();
  const files = await Promise.all(ns.map(async (n) => ({ name: `p${n}.jpg`, mimeType: "image/jpeg", buffer: await jpeg(n) })));
  await page.getByTestId("photo-input").setInputFiles(files);
  await page.waitForFunction(
    (want) => {
      const all = document.querySelectorAll('[data-testid="photo-tile"]');
      return all.length === want && [...all].every((t) => t.getAttribute("data-status") === "ready");
    },
    before + ns.length,
    { timeout: 120_000 }, // up to 8 shrink + upload + finalise cycles, two at a time
  );
}

/** Opens tile `index`'s (1-based) options and presses `item`. */
export async function tileMenu(page: Page, index: number, item: "Make lead" | "Tag" | "Describe" | "Move earlier" | "Move later" | "Remove"): Promise<void> {
  const options = page.getByTestId(`photo-options-${index}`);
  const panel = page.getByRole("group", { name: `Photo ${index} options` });
  if ((await options.getAttribute("aria-expanded")) !== "true") await options.click();
  else if (await panel.getByRole("button", { name: "Back", exact: true }).isVisible()) await panel.getByRole("button", { name: "Back", exact: true }).click(); // a sub-panel is open: back to the menu
  await panel.getByRole("button", { name: item, exact: true }).click();
}

/** Describe, the text field, Save description; resolved once the panel has closed (the save went through). */
export async function describeTile(page: Page, index: number, alt: string): Promise<void> {
  await tileMenu(page, index, "Describe");
  const panel = page.getByRole("group", { name: `Photo ${index} options` });
  await panel.getByLabel("Describe", { exact: true }).fill(alt);
  await panel.getByRole("button", { name: "Save description" }).click();
  await panel.waitFor({ state: "hidden" });
}

/** Tag, then the radio named `place` ("No tag" included). Resolved once the server holds the tag and the strip is quiet. */
export async function tagTile(page: Page, index: number, place: string): Promise<void> {
  const photoId = (await page.getByTestId("photo-tile").nth(index - 1).getAttribute("data-photo-id")) ?? "";
  await tileMenu(page, index, "Tag");
  await page.getByRole("group", { name: `Photo ${index} options` }).getByRole("radio", { name: place, exact: true }).check();
  const want = place !== "No tag";
  const tagged = () => withDb(async (sql) => (await sql`select prize_slot from break_photos where id = ${photoId}::uuid`)[0]?.prize_slot != null);
  await expect.poll(tagged, { timeout: 15_000, message: `photo ${index} becomes ${place}` }).toBe(want);
  // A tag on a photo with its default description also rewrites that description, one action after the tag.
  await page.waitForLoadState("networkidle");
}

/** The same fields `composeBreak` fills, condition included, without submitting. `alternative` adds an "or" item. */
export async function fillComposer(page: Page, o: { title: string; lineCount?: number; price?: string; alternative?: string }): Promise<void> {
  await gotoReady(page, "/host/new");
  await page.fill("input[name=title]", o.title);
  await page.fill("input[name=prize1]", "Chronos 22g");
  await page.selectOption("select[name=prize1Condition]", "new_in_box");
  if (o.alternative) {
    await page.getByRole("button", { name: "Add a choice" }).click();
    await page.locator("#prize1-1").fill(o.alternative);
    await page.selectOption("#prize1-condition-1", "new_in_box");
  }
  await page.fill("input[name=venmo]", "@e2e-host");
  await page.fill("input[name=lineCount]", String(o.lineCount ?? 4));
  await page.fill("input[name=linePrice]", o.price ?? "5");
}
