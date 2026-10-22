import { test, expect, type Page, type Route } from "@playwright/test";
import { composeBreakWithPhotos, gotoReady, jpeg, loginAs } from "./helpers";
import { withDb } from "./db";

// The composer's photo strip in a real browser: gating, limits, the draft the first photo makes, upload states,
// drag and keyboard reorder, and Remove with Undo. Needs Storage up (the preflight in the README).
test.describe.configure({ mode: "serial" });

const run = Date.now();
const host = `ps${run}@e2e.test`;

async function fillDraftable(page: Page, title: string) {
  await page.fill("input[name=title]", title);
  await page.fill("input[name=prize1]", "Chronos 22g");
  await page.selectOption("select[name=prize1Condition]", "new_in_box");
  await page.fill("input[name=lineCount]", "4");
  await page.fill("input[name=linePrice]", "5");
}
const readyTiles = (page: Page) => page.getByTestId("photo-tile").and(page.locator("[data-status=ready]"));
const order = (page: Page) => page.getByTestId("photo-tile").evaluateAll((els) => els.map((e) => e.getAttribute("data-photo-id")));
const tagged = (id: string) => withDb(async (sql) => (await sql`select prize_slot from break_photos where break_id = ${id} and removed_at is null and prize_slot is not null order by position desc`)[0]?.prize_slot ?? null);
const files = (n: number, prefix = "f") => Promise.all(Array.from({ length: n }, async (_, i) => ({ name: `${prefix}${i + 1}.jpg`, mimeType: "image/jpeg", buffer: await jpeg(i + 1) })));

test("composeBreakWithPhotos opens a break with two published photos (Task 7a's helper)", async ({ page }) => {
  await loginAs(page, host, "host");
  const url = await composeBreakWithPhotos(page, { title: `Strip helper ${run}`, photos: 2 });
  expect(url).toMatch(/\/b\/[0-9a-f-]{36}$/);
  const id = url.split("/").pop()!;
  const rows = await withDb((sql) => sql`select bucket from break_photos where break_id = ${id} and removed_at is null and hidden_at is null`);
  expect(rows.map((r) => r.bucket)).toEqual(["photos", "photos"]);
});

test("Add photos waits for the title, the price and the top spot with its condition", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await page.fill("input[name=title]", "");
  await page.fill("input[name=linePrice]", "");
  await page.fill("input[name=prize1]", "");
  const add = page.getByTestId("photo-add");
  await expect(add).toBeDisabled();
  await expect(page.getByText("Add a title, a price and the top spot first.")).toBeVisible();
  await page.fill("input[name=title]", "Strip break");
  await expect(add).toBeDisabled();
  await page.fill("input[name=linePrice]", "5");
  await expect(add).toBeDisabled();
  await page.fill("input[name=prize1]", "Chronos 22g");
  await expect(add).toBeDisabled();
  await page.selectOption("select[name=prize1Condition]", "new_in_box");
  await expect(add).toBeEnabled();
  await expect(page.getByText("Add a title, a price and the top spot first.")).toHaveCount(0);
});

test("nine picks: eight tiles and the reason for the ninth, before any network call", async ({ page }) => {
  test.setTimeout(150_000);
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Nine picks");
  const calls: string[] = [];
  const held: Route[] = [];
  let release = false;
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.method() === "GET" || release) return route.fallback();
    calls.push(`${r.method()} ${new URL(r.url()).pathname}`); // hold every POST and PUT
    held.push(route);
  });
  await page.getByTestId("photo-input").setInputFiles(await files(9, "n"));
  await expect(page.getByTestId("photo-notice")).toHaveText("Photos are limited to 8 per break. 1 photo was not added.");
  await expect(page.getByTestId("photo-tile")).toHaveCount(8);
  expect(calls.filter((c) => c.startsWith("PUT ") || c.includes("/api/photos/finalise"))).toEqual([]); // nothing uploaded yet
  expect(calls.length).toBeLessThanOrEqual(1); // at most the held draft save
  release = true;
  for (const r of held.splice(0)) await r.fallback();
  await expect(readyTiles(page)).toHaveCount(8, { timeout: 120_000 });
});

test("the same file picked twice uploads twice", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Twice");
  const puts: string[] = [];
  page.on("request", (r) => { if (r.method() === "PUT" && r.url().includes("/storage/v1/object/upload/sign/")) puts.push(r.url()); });
  const buffer = await jpeg(5);
  await page.getByTestId("photo-input").setInputFiles([{ name: "same.jpg", mimeType: "image/jpeg", buffer }, { name: "same.jpg", mimeType: "image/jpeg", buffer }]);
  await expect(readyTiles(page)).toHaveCount(2);
  expect(puts).toHaveLength(2);
  expect(new Set(await order(page)).size).toBe(2);
});

test("an unreadable file is refused on the spot and the others go on", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Unreadable");
  await page.getByTestId("photo-input").setInputFiles([
    { name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) },
    { name: "x.heic", mimeType: "image/heic", buffer: Buffer.from("not an image") },
  ]);
  await expect(page.getByTestId("photo-notice")).toHaveText("This photo can't be read here. Pick a JPEG or PNG.");
  await expect(page.getByTestId("photo-tile")).toHaveCount(1);
  await expect(readyTiles(page)).toHaveCount(1);
});

test("the first photo makes the draft and moves the address; Save draft keeps the photo and its tag; no hydration error", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "First photo");
  const id = await page.locator("input[name=newBreakId]").inputValue();
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }]);
  await expect(readyTiles(page)).toHaveCount(1);
  await expect(page).toHaveURL(`/host/${id}/edit`);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await page.getByRole("radio", { name: "Chronos 22g" }).check();
  await page.getByTestId("composer-draft").click();
  await page.waitForURL(`/b/${id}`);
  await gotoReady(page, `/host/${id}/edit`);
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("radio", { name: "Chronos 22g" })).toBeChecked();
  expect(errors.filter((e) => /hydrat/i.test(e))).toEqual([]);
});

test("while an upload is in flight the banner shows and Save and Open stay enabled", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "In flight");
  let hold: Route | null = null;
  await page.route("**/storage/v1/object/upload/sign/**", (route) => { hold = route; });
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }]);
  await expect(page.getByTestId("photo-uploading-banner")).toHaveText("Photos are still uploading. Stay on this page until they finish.");
  await expect(page.getByTestId("composer-draft")).toBeEnabled();
  await expect(page.getByTestId("composer-open")).toBeEnabled();
  await expect.poll(() => hold !== null).toBe(true);
  await page.unroute("**/storage/v1/object/upload/sign/**");
  await (hold as unknown as Route).fallback();
  await expect(readyTiles(page)).toHaveCount(1);
  await expect(page.getByTestId("photo-uploading-banner")).toHaveCount(0);
});

test("drag the third tile onto the first: it becomes the lead, and the order survives a reload", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Drag");
  await page.getByTestId("photo-input").setInputFiles(await files(3, "d"));
  await expect(readyTiles(page)).toHaveCount(3);
  const [a, b, c] = await order(page);
  await page.getByTestId("photo-strip").scrollIntoViewIfNeeded(); // the mouse works in viewport coordinates
  const grip = (await page.getByTestId("photo-grip").nth(2).boundingBox())!;
  const first = (await page.getByTestId("photo-tile").first().boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + 10, first.y + 10, { steps: 8 });
  // The tiles move at once; the reload below must come after the save has landed.
  await Promise.all([page.waitForResponse((r) => r.request().method() === "POST" && "next-action" in r.request().headers()), page.mouse.up()]);
  await expect.poll(() => order(page)).toEqual([c, a, b]);
  await expect(page.getByTestId("photo-tile").first()).toContainText("Lead");
  await page.reload();
  await expect(readyTiles(page)).toHaveCount(3);
  expect(await order(page)).toEqual([c, a, b]);
});

test("Move earlier is the keyboard path, and is aria-disabled on the lead", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Keys");
  await page.getByTestId("photo-input").setInputFiles(await files(2, "k"));
  await expect(readyTiles(page)).toHaveCount(2);
  const [a, b] = await order(page);
  await page.getByTestId("photo-options-1").click();
  await expect(page.getByRole("button", { name: "Move earlier" })).toHaveAttribute("aria-disabled", "true");
  await page.fill("textarea[name=description]", "typed before the move");
  await page.getByTestId("photo-options-2").click();
  await page.getByRole("button", { name: "Move earlier" }).click();
  await expect.poll(() => order(page)).toEqual([b, a]);
  // The address moved without a navigation and a photo change must not reload the page under the host's feet.
  await page.waitForTimeout(1500);
  await expect(page.locator("textarea[name=description]")).toHaveValue("typed before the move");
});

test("Remove shows Undo for 8 seconds; Undo restores the tile; a removal left alone commits", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Undo");
  await page.getByTestId("photo-input").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: await jpeg(1) }]);
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Photo removed.")).toBeVisible();
  await expect(page.getByTestId("photo-tile")).toHaveCount(0);
  await page.getByTestId("photo-undo").click();
  await expect(page.getByTestId("photo-tile")).toHaveCount(1);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("photo-undo")).toHaveCount(0, { timeout: 10_000 }); // the 8 seconds ran out
  await page.reload();
  await expect(page.getByTestId("photo-strip")).toBeVisible();
  await expect(page.getByTestId("photo-tile")).toHaveCount(0);
});

test("a prize typed after the draft exists can be tagged, on the new page and on the edit page, and the tag persists", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Late prizes");
  const id = await page.locator("input[name=newBreakId]").inputValue();
  await page.getByTestId("photo-input").setInputFiles(await files(1, "t"));
  await expect(readyTiles(page)).toHaveCount(1);
  await expect(page).toHaveURL(`/host/${id}/edit`);
  // A 2nd place typed now is unknown to the server until the strip saves the form for the tag.
  await page.getByRole("button", { name: "Add 2nd place" }).click();
  await page.fill("input[name=prize2]", "Flight pack");
  await page.selectOption("select[name=prize2Condition]", "used");
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await page.getByRole("radio", { name: "Flight pack" }).check();
  await expect.poll(() => tagged(id)).not.toBeNull(); // saved with its prize; reload only after
  await expect(page.getByTestId("photo-notice")).toHaveCount(0);
  await page.reload();
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("radio", { name: "Flight pack" })).toBeChecked();
  // On the edit page too: a choice typed here is saved for the tag.
  await page.getByRole("button", { name: "Add a choice" }).click();
  await page.locator("input[name=prize1]").nth(1).fill("Spare steel set");
  await page.locator("select[name=prize1Condition]").nth(1).selectOption("new_opened");
  const before = await tagged(id);
  await page.getByRole("radio", { name: "Spare steel set" }).check();
  await expect.poll(() => tagged(id)).not.toBe(before);
  await expect(page.getByTestId("photo-notice")).toHaveCount(0);
  await page.reload();
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByTestId("photo-options-1").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("radio", { name: "Spare steel set" })).toBeChecked();
});

test("a prize typed between two photos can be tagged on either (the draft is saved again for the tag)", async ({ page }) => {
  await loginAs(page, host, "host");
  await gotoReady(page, "/host/new");
  await fillDraftable(page, "Between photos");
  const id = await page.locator("input[name=newBreakId]").inputValue();
  await page.getByTestId("photo-input").setInputFiles(await files(1, "b"));
  await expect(readyTiles(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Add 2nd place" }).click();
  await page.fill("input[name=prize2]", "Dart case");
  await page.selectOption("select[name=prize2Condition]", "new_in_box");
  await page.getByTestId("photo-input").setInputFiles((await files(2, "c")).slice(1));
  await expect(readyTiles(page)).toHaveCount(2);
  await page.getByTestId("photo-options-2").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await page.getByRole("radio", { name: "Dart case" }).check();
  await expect.poll(() => tagged(id)).not.toBeNull();
  await expect(page.getByTestId("photo-notice")).toHaveCount(0);
  await page.reload();
  await expect(readyTiles(page)).toHaveCount(2);
  await page.getByTestId("photo-options-2").click();
  await page.getByRole("button", { name: "Tag" }).click();
  await expect(page.getByRole("radio", { name: "Dart case" })).toBeChecked();
});
