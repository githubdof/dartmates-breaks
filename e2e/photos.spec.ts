import { test, expect, type Browser, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { axeViolations, composeBreak, composeBreakWithPhotos, gotoReady, loginAs, ranBreak } from "./helpers";
import { listObjects, withDb } from "./db";
import { addPhotos, describeTile, fillComposer, tagTile, tileMenu } from "./photo-helpers";

// The photo viewer in a real browser (photos spec §8.3). Task 12b appends the journeys to this file.
test.describe.configure({ mode: "serial" });

const run = Date.now();
let viewer3 = "";
let viewer1 = "";

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext()).newPage();
  await loginAs(page, `pv${run}@e2e.test`, "host");
  viewer3 = await composeBreakWithPhotos(page, { title: `Viewer three ${run}`, photos: 3 });
  viewer1 = await composeBreakWithPhotos(page, { title: `Viewer one ${run}`, photos: 1 });
  await page.close();
});

async function open(page: Page, n: number) {
  await page.getByRole("button", { name: `${n} ${n === 1 ? "photo" : "photos"} of the prizes` }).click();
  await expect(page.getByTestId("photo-viewer")).toBeVisible();
}

test("nothing of the viewer loads before the tap: no extra script, no 1600 px image", async ({ page }) => {
  const images: string[] = [];
  const scriptsBefore: string[] = [];
  const scriptsAfter: string[] = [];
  let tapped = false;
  page.on("request", (r) => {
    if (/-1600\.webp/.test(r.url())) images.push(r.url());
    if (r.resourceType() === "script") (tapped ? scriptsAfter : scriptsBefore).push(r.url());
  });
  await gotoReady(page, viewer3);
  expect(images).toEqual([]);
  expect(await page.locator("[data-photo-viewer-root]").count()).toBe(0);
  const bodyHasMarker = async (url: string) => (await (await page.request.get(url)).text()).includes("data-photo-viewer-root");
  for (const u of scriptsBefore) expect(await bodyHasMarker(u), u).toBe(false);
  tapped = true;
  await page.getByRole("button", { name: "3 photos of the prizes" }).click();
  await expect(page.getByTestId("photo-viewer")).toBeVisible();
  await expect(page.locator("[data-photo-viewer-root]")).toHaveCount(1);
  const marked = await Promise.all(scriptsAfter.map(bodyHasMarker));
  expect(marked.some(Boolean)).toBe(true);
  await expect.poll(() => images.length).toBeGreaterThan(0);
});

test("by keyboard: open, arrows, ends hide Previous and Next, Escape returns focus to the plate", async ({ page }) => {
  await gotoReady(page, viewer3);
  const plate = page.getByRole("button", { name: "3 photos of the prizes" });
  await plate.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 1 of 3");
  await expect(page.getByTestId("viewer-prev")).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 2 of 3");
  await expect(page.getByTestId("viewer-prev")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-next")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("photo-viewer")).toBeHidden();
  await expect(plate).toBeFocused();
});

test("when Next disappears at the end, focus moves to Previous", async ({ page }) => {
  await gotoReady(page, viewer3);
  await open(page, 3);
  await page.keyboard.press("ArrowRight");
  await page.getByTestId("viewer-next").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("viewer-next")).toHaveCount(0);
  await expect(page.getByTestId("viewer-prev")).toBeFocused();
});

test("two quick ArrowRight presses land on photo 3 and the announcement never steps back", async ({ browser }) => {
  const page = await (await browser.newContext({ reducedMotion: "no-preference" })).newPage();
  await gotoReady(page, viewer3);
  await open(page, 3);
  await page.getByTestId("viewer-announce").evaluate((el) => {
    const w = window as unknown as { __seen: string[] };
    w.__seen = [el.textContent ?? ""];
    new MutationObserver(() => w.__seen.push(el.textContent ?? "")).observe(el, { childList: true, characterData: true, subtree: true });
  });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 3 of 3");
  // The strip settles on the third slide, and the index is still the third once it has.
  await expect.poll(() => page.getByTestId("viewer-strip").evaluate((e) => Math.abs(e.scrollLeft - 2 * e.clientWidth) < 2)).toBe(true);
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 3 of 3");
  await expect(page.getByTestId("viewer-next")).toHaveCount(0);
  const seen = await page.evaluate(() => (window as unknown as { __seen: string[] }).__seen.map((t) => Number(t.split(" ")[1])));
  expect(seen).toEqual([...seen].sort((a, b) => a - b));
});

test("one photo: no Previous or Next; Close and Escape both close", async ({ page }) => {
  await gotoReady(page, viewer1);
  const plate = page.getByRole("button", { name: "1 photo of the prizes" });
  await open(page, 1);
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 1 of 1");
  await expect(page.getByTestId("viewer-prev")).toHaveCount(0);
  await expect(page.getByTestId("viewer-next")).toHaveCount(0);
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("photo-viewer")).toBeHidden();
  await expect(plate).toBeFocused();
  await open(page, 1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("photo-viewer")).toBeHidden();
  await expect(plate).toBeFocused();
});

test("Previous, Next and Close are at least 44 px", async ({ page }) => {
  await gotoReady(page, viewer3);
  await open(page, 3);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("viewer-prev")).toBeVisible();
  for (const b of [page.getByTestId("viewer-prev"), page.getByTestId("viewer-next"), page.getByRole("button", { name: "Close" })]) {
    const box = (await b.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("a Prizes plate opens the viewer at its own photo", async ({ page }) => {
  await gotoReady(page, viewer3);
  await page.getByTestId("prizes-block").getByRole("button", { name: "Photo 2 of 3" }).click();
  await expect(page.getByTestId("viewer-announce")).toHaveText("Photo 2 of 3");
});

for (const [w, h] of [[320, 568], [667, 375]] as const) {
  test(`the photo fits at ${w} x ${h} with no sideways scroll`, async ({ browser }) => {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true })).newPage();
    await gotoReady(page, viewer3);
    await open(page, 3);
    const img = page.getByTestId("viewer-strip").locator("img").first();
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0)).toBe(true);
    const m = await page.evaluate(() => {
      const d = document.querySelector("[data-testid=photo-viewer]")!;
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, dsw: d.scrollWidth, dcw: d.clientWidth };
    });
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    expect(m.dsw).toBeLessThanOrEqual(m.dcw);
    const box = (await img.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(-0.5);
    expect(box.y).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
  });
}

test("reduced motion: the strip does not scroll smoothly; without it, it does", async ({ browser }) => {
  const behaviour = async (reducedMotion: "reduce" | "no-preference") => {
    const page = await (await browser.newContext({ reducedMotion })).newPage();
    await gotoReady(page, viewer3);
    await open(page, 3);
    return page.getByTestId("viewer-strip").evaluate((e) => getComputedStyle(e).scrollBehavior);
  };
  expect(await behaviour("reduce")).toBe("auto");
  expect(await behaviour("no-preference")).toBe("smooth");
});

test("axe is clean on a break page with photos, with the viewer closed and open", async ({ page }) => {
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
  await gotoReady(page, viewer3);
  expect((await new AxeBuilder({ page }).withTags(tags).analyze()).violations).toEqual([]);
  await open(page, 3);
  expect((await new AxeBuilder({ page }).withTags(tags).include("[data-testid=photo-viewer]").analyze()).violations).toEqual([]);
});

test("a feed card's corner board clips its lamp, so no glow reaches the photo (spec §8.0)", async ({ page }) => {
  await gotoReady(page, "/breaks");
  const card = page.getByTestId("break-card").filter({ hasText: `Viewer one ${run}` });
  const corner = card.getByTestId("card-corner");
  await expect(corner).toBeVisible();
  // The lamp extends 12 px past the board; overflow:hidden on the corner is what keeps that band off the plate.
  expect(await corner.evaluate((el) => getComputedStyle(el).overflow)).toBe("hidden");
  const lamp = corner.locator(".board-lamp");
  expect(await lamp.count()).toBe(1);
  const [c, l] = await Promise.all([corner.boundingBox(), lamp.boundingBox()]);
  expect(l!.x).toBeLessThan(c!.x); // it does overflow the box, so the clip matters
});

// ---------------------------------------------------------------------------------------------------------------
// Task 12b: the journeys that cross tasks. Every photo is generated by jpeg(n); nothing is committed. A host's uploads
// are rate limited (about 30 an hour per user), so the upload-heavy axe test has a host of its own.
// ---------------------------------------------------------------------------------------------------------------
test.describe("photo journeys (Task 12b)", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  const stamp = Date.now();
  const hostHandle = `ph${stamp}`;
  const hostEmail = `${hostHandle}@e2e.test`;
  const buyerEmail = `pb${stamp}@e2e.test`;
  const axeHost = `pa${stamp}`;
  const withPhotos = `Photos ${stamp}`;
  const bareTitle = `Bare ${stamp}`;
  const replaceTitle = `Replace ${stamp}`;
  const lastTitle = `Last photo ${stamp}`;
  let journey1 = "";
  let replaceUrl = "";
  let lastUrl = "";
  let hostPage: Page;

  const idOf = (u: string) => u.split("/b/")[1];
  const publicSrc = /\/storage\/v1\/object\/public\/photos\//;

  async function ctxPage(browser: Browser, email?: string, role: "member" | "host" = "member"): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    if (email) await loginAs(page, email, role);
    return page;
  }
  async function imagesLoaded(page: Page, scope: string) {
    await expect.poll(() => page.locator(`${scope} img`).evaluateAll((els) => els.length > 0 && els.every((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  /** The buyer takes `numbers` on a break and waits for the owed line. */
  async function claim(browser: Browser, url: string, numbers: number[]) {
    const buyer = await ctxPage(browser, buyerEmail);
    await gotoReady(buyer, url);
    for (const n of numbers) await buyer.getByTestId(`cell-${n}`).click();
    await buyer.getByTestId("claim-submit").click();
    await expect(buyer.getByTestId("owed")).toBeVisible();
    await buyer.context().close();
  }
  async function closeSheet(page: Page) {
    await page.getByRole("dialog", { name: "Edit photos" }).getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog", { name: "Edit photos" })).toBeHidden();
  }
  const liveOrder = (breakId: string) => withDb(async (sql) => (await sql`select id from break_photos where break_id = ${breakId}::uuid and removed_at is null order by position`).map((r) => r.id as string));

  test.beforeAll(async ({ browser }) => {
    hostPage = await ctxPage(browser, hostEmail, "host");
  });
  test.afterAll(async () => { await hostPage.context().close(); });

  test("a host adds photos from the composer and opens the break; the photo shows on the feed card, the plate and the Prizes block, served from photos", async ({ browser }) => {
    await composeBreak(hostPage, { title: bareTitle }); // a photo-less card on the same feed page, for the title's left edge
    await fillComposer(hostPage, { title: withPhotos });
    await addPhotos(hostPage, [1, 2]);
    await describeTile(hostPage, 1, "Chronos on a desk");
    await tagTile(hostPage, 1, "Chronos 22g");
    await hostPage.getByTestId("composer-open").click();
    await hostPage.waitForURL(/\/b\/[0-9a-f-]{36}$/);
    journey1 = hostPage.url();

    // The feed card.
    await gotoReady(hostPage, `/breaks?host=${hostHandle}`);
    const card = hostPage.getByTestId("break-card").filter({ hasText: withPhotos });
    await expect(card.locator("img")).toHaveCount(1);
    await expect(card.locator("img")).toHaveAttribute("alt", "");
    await expect(card.locator("img")).toHaveAttribute("src", publicSrc);
    expect(await card.getByTestId("thumb").locator("[data-tone]").count()).toBeGreaterThan(0);
    const media = (await card.getByTestId("card-media").boundingBox())!;
    const plate = (await card.getByTestId("plate").boundingBox())!;
    const thumb = (await card.getByTestId("thumb").boundingBox())!;
    for (const b of [plate, thumb]) {
      expect(b.x).toBeGreaterThanOrEqual(media.x - 0.5);
      expect(b.y).toBeGreaterThanOrEqual(media.y - 0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(media.x + media.width + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(media.y + media.height + 0.5);
    }
    const w = Math.min(plate.x + plate.width, thumb.x + thumb.width) - Math.max(plate.x, thumb.x);
    const h = Math.min(plate.y + plate.height, thumb.y + thumb.height) - Math.max(plate.y, thumb.y);
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(w * h).toBeLessThanOrEqual((plate.width * plate.height) / 3);
    const titleLeft = async (t: string) => (await hostPage.getByTestId("break-card").filter({ hasText: t }).getByText(t, { exact: true }).boundingBox())!.x;
    expect(await titleLeft(withPhotos)).toBeCloseTo(await titleLeft(bareTitle), 0);

    // The break page: the plate button and the Prizes block, both from the public bucket.
    await gotoReady(hostPage, journey1);
    const plateButton = hostPage.getByRole("button", { name: "2 photos of the prizes" });
    await expect(plateButton).toBeVisible();
    await expect(plateButton.locator("img")).toHaveAttribute("src", publicSrc);
    await imagesLoaded(hostPage, '[data-testid="photo-plate"]');
    const top = hostPage.getByTestId("prizes-block").getByTestId("prize-place").first();
    await expect(top.locator("img").first()).toHaveAttribute("alt", "Chronos on a desk");
    await expect(top.locator("img").first()).toHaveAttribute("src", publicSrc);

    // The served HTML carries no viewer code before the tap (the viewer is loaded on demand).
    const anon = await ctxPage(browser);
    const html = await (await anon.request.get(journey1)).text();
    expect(html).not.toContain("data-photo-viewer-root");
    await anon.context().close();
  });

  test("a prize's condition shows in the Prizes block", async () => {
    await gotoReady(hostPage, journey1);
    await expect(hostPage.getByTestId("prizes-block").getByTestId("prize-place").first()).toContainText(/Chronos 22g.*New in box/);
  });

  test("a draft's photo is not readable without the host's signed URL", async ({ browser }) => {
    await fillComposer(hostPage, { title: `Draft photo ${stamp}` });
    await addPhotos(hostPage, [3]);
    await hostPage.getByTestId("composer-draft").click();
    await hostPage.waitForURL(/\/b\/[0-9a-f-]{36}$/);
    const draftUrl = hostPage.url();
    await gotoReady(hostPage, `/host/${idOf(draftUrl)}/edit`);
    const src = (await hostPage.getByTestId("photo-tile").first().locator("img").getAttribute("src"))!;
    expect(src).toContain("token=");
    const signed = await hostPage.request.get(src);
    expect(signed.status()).toBe(200);
    expect(signed.headers()["content-type"]).toBe("image/webp");
    const object = new URL(src).pathname.split("/storage/v1/object/sign/photos-draft/")[1];
    expect(object).toBeTruthy();
    const base = `${new URL(src).origin}/storage/v1/object/public`;
    for (const bucket of ["photos-draft", "photos"]) {
      const r = await hostPage.request.get(`${base}/${bucket}/${object}`);
      expect(r.ok(), `${bucket} public read`).toBe(false);
    }
    const anon = await ctxPage(browser);
    const page = await anon.request.get(draftUrl);
    expect(page.status()).toBe(404);
    expect(await page.text()).not.toContain("photos-draft");
    await anon.context().close();
  });

  test("after a buyer claims, the host replaces the lead (Remove, then Make lead); the buyer sees 'Lead photo replaced', on /me too, and the old lead marked Removed; a stranger does not", async ({ browser }) => {
    replaceUrl = await composeBreakWithPhotos(hostPage, { title: replaceTitle, photos: 2 });
    await claim(browser, replaceUrl, [1, 2]);

    await gotoReady(hostPage, replaceUrl);
    await hostPage.getByTestId("edit-photos").click();
    await addPhotos(hostPage, [5]); // tile 3
    await describeTile(hostPage, 1, "Old lead cartridge");
    await tileMenu(hostPage, 1, "Remove");
    await expect(hostPage.getByText("Buyers in this break will still see this photo, marked Removed.", { exact: true })).toBeVisible();
    await hostPage.getByRole("button", { name: "Remove photo" }).click();
    await expect(hostPage.getByTestId("photo-tile")).toHaveCount(2);
    await expect.poll(async () => (await liveOrder(idOf(replaceUrl))).length).toBe(2);
    await tileMenu(hostPage, 2, "Make lead"); // the new photo, now second
    const newLead = (await hostPage.getByTestId("photo-tile").nth(0).getAttribute("data-photo-id"))!;
    await expect.poll(async () => (await liveOrder(idOf(replaceUrl)))[0]).toBe(newLead);
    await closeSheet(hostPage);

    // The buyer's /me shows the notice (and the plate) before the break page marks it seen.
    const buyer = await ctxPage(browser, buyerEmail);
    await gotoReady(buyer, "/me");
    const myCard = buyer.getByTestId("my-break").filter({ hasText: replaceTitle });
    await expect(myCard.getByTestId("my-photo-notice")).toContainText("Lead photo replaced");

    await gotoReady(buyer, replaceUrl);
    const plate = buyer.getByTestId("photo-plate");
    await expect(plate).toContainText("Updated");
    const box = (await plate.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(buyer.viewportSize()!.height);
    await expect(buyer.getByTestId("photo-notice-line")).toContainText("Lead photo replaced");
    await expect(buyer.getByTestId("removed-plate")).toHaveCount(1);
    await expect(buyer.getByTestId("removed-plate")).toHaveText(/Removed [A-Z][a-z]{2} \d{1,2}/);
    await expect(buyer.getByTestId("removed-plate").locator("img")).toHaveAttribute("src", /token=/);

    await expect.poll(async () => {
      await buyer.goto("/me");
      return buyer.getByTestId("my-break").filter({ hasText: replaceTitle }).getByTestId("my-photo-notice").count();
    }, { timeout: 5_000 }).toBe(0);
    await expect(buyer.getByTestId("my-break").filter({ hasText: replaceTitle }).getByTestId("plate")).toHaveCount(1);
    await buyer.context().close();

    // A stranger sees the notice but no removed photo.
    const stranger = await ctxPage(browser);
    await gotoReady(stranger, replaceUrl);
    await expect(stranger.getByText(/\bRemoved\b/)).toHaveCount(0);
    await expect(stranger.getByTestId("photo-notice-line")).toContainText("Lead photo replaced");
    expect(await stranger.locator('img[src*="photo-archive"], img[src*="token="]').count()).toBe(0);
    // View-source: nothing of the archive, no signed URL, not the removed photo's own description.
    const html = await (await stranger.request.get(replaceUrl)).text();
    for (const leak of ["photo-archive", "token=", "seconds=", "Old lead cartridge"]) expect(html, leak).not.toContain(leak);
    await stranger.context().close();
  });

  test("removing the only photo after a claim: no plate, the feed falls back to the kit thumbnail, the notice says what was removed, and the buyer still sees it marked Removed", async ({ browser }) => {
    await fillComposer(hostPage, { title: lastTitle });
    await addPhotos(hostPage, [6]);
    await tagTile(hostPage, 1, "Chronos 22g");
    await hostPage.getByTestId("composer-open").click();
    await hostPage.waitForURL(/\/b\/[0-9a-f-]{36}$/);
    lastUrl = hostPage.url();
    await claim(browser, lastUrl, [1]);

    await gotoReady(hostPage, lastUrl);
    await hostPage.getByTestId("edit-photos").click();
    await tileMenu(hostPage, 1, "Remove");
    await hostPage.getByRole("button", { name: "Remove photo" }).click();
    await expect(hostPage.getByTestId("photo-tile")).toHaveCount(0);
    await expect.poll(async () => (await liveOrder(idOf(lastUrl))).length).toBe(0);
    await closeSheet(hostPage);

    await gotoReady(hostPage, lastUrl);
    await expect(hostPage.getByRole("button", { name: /photos? of the prizes/ })).toHaveCount(0);
    await gotoReady(hostPage, `/breaks?host=${hostHandle}`);
    const card = hostPage.getByTestId("break-card").filter({ hasText: lastTitle });
    await expect(card.locator("img")).toHaveCount(0);
    await expect(card.getByTestId("thumb")).toHaveAttribute("style", /width:\s*108px/);

    // /me first: the break page marks the notice seen, and /me shows it only while unseen.
    const buyer = await ctxPage(browser, buyerEmail);
    await gotoReady(buyer, "/me");
    const mine = buyer.getByTestId("my-break").filter({ hasText: lastTitle });
    await expect(mine).toContainText("Top-spot photo removed");
    await expect(mine.getByTestId("plate")).toHaveCount(0);
    await gotoReady(buyer, lastUrl);
    await expect(buyer.getByTestId("photo-notice-line")).toContainText("Top-spot photo removed");
    await expect(buyer.getByTestId("removed-plate")).toHaveCount(1);
    await buyer.context().close();

    const stranger = await ctxPage(browser);
    await gotoReady(stranger, lastUrl);
    await expect(stranger.getByTestId("removed-plate")).toHaveCount(0);
    await expect(stranger.getByText(/\bRemoved\b/)).toHaveCount(0);
    await stranger.context().close();
  });

  test("a draft's photos and tags survive a re-save that removes an 'or' alternative", async () => {
    await fillComposer(hostPage, { title: `Or draft ${stamp}`, alternative: "Phantom 24g" });
    await addPhotos(hostPage, [7, 8]);
    await tagTile(hostPage, 1, "Chronos 22g");
    await tagTile(hostPage, 2, "Phantom 24g");
    await describeTile(hostPage, 2, "Phantom on a mat");
    await hostPage.getByTestId("composer-draft").click();
    await hostPage.waitForURL(/\/b\/[0-9a-f-]{36}$/);
    const id = idOf(hostPage.url());

    await gotoReady(hostPage, `/host/${id}/edit`);
    await hostPage.locator("#prize1-1").locator("xpath=following-sibling::button").click(); // the "or" choice's Remove
    await expect(hostPage.locator("#prize1-1")).toHaveCount(0);
    await hostPage.getByTestId("composer-draft").click();
    await hostPage.waitForURL(`**/b/${id}`);

    await gotoReady(hostPage, `/host/${id}/edit`);
    await expect(hostPage.getByTestId("photo-tile")).toHaveCount(2);
    await tileMenu(hostPage, 1, "Tag");
    await expect(hostPage.getByRole("radio", { name: "Chronos 22g", exact: true })).toBeChecked();
    await hostPage.getByRole("button", { name: "Back" }).click();
    await tileMenu(hostPage, 2, "Tag");
    await expect(hostPage.getByRole("radio", { name: "No tag", exact: true })).toBeChecked();
    await hostPage.getByRole("button", { name: "Back" }).click();
    await tileMenu(hostPage, 2, "Describe");
    await expect(hostPage.getByLabel("Describe", { exact: true })).toHaveValue("Phantom on a mat");
  });

  test("Delete draft removes the draft's photos", async () => {
    await fillComposer(hostPage, { title: `Delete me ${stamp}` });
    await addPhotos(hostPage, [9]);
    const src = (await hostPage.getByTestId("photo-tile").first().locator("img").getAttribute("src"))!;
    const object = new URL(src).pathname.split("/storage/v1/object/sign/photos-draft/")[1];
    const prefix = object.replace(/-\d+\.webp$/, "");
    expect(await listObjects("photos-draft", prefix)).toHaveLength(3);
    await hostPage.getByTestId("composer-draft").click();
    await hostPage.waitForURL(/\/b\/[0-9a-f-]{36}$/);
    await gotoReady(hostPage, "/host");
    const row = hostPage.locator("li", { hasText: `Delete me ${stamp}` });
    await row.getByTestId("delete-draft").click();
    await row.getByTestId("delete-draft-confirm").click();
    await expect(hostPage.getByText(`Delete me ${stamp}`)).toHaveCount(0);
    await expect.poll(() => listObjects("photos-draft", prefix), { timeout: 5_000 }).toEqual([]);
  });

  test("axe finds no WCAG 2.1 A or AA violation on every page the photos touch", async ({ browser }) => {
    test.setTimeout(300_000);
    const found: string[] = [];
    const anon = await ctxPage(browser);
    for (const path of ["/", "/breaks", `/h/${hostHandle}`, replaceUrl]) {
      await gotoReady(anon, path);
      found.push(...(await axeViolations(anon, `anonymous ${path}`)));
    }
    const buyer = await ctxPage(browser, buyerEmail);
    await gotoReady(buyer, replaceUrl);
    found.push(...(await axeViolations(buyer, "buyer break page")));
    await buyer.getByTestId("owed").click();
    await expect(buyer.getByTestId("pay-sheet")).toBeVisible();
    await expect(buyer.getByTestId("pay-break")).toBeVisible();
    found.push(...(await axeViolations(buyer, "buyer pay sheet with its break header")));
    await gotoReady(buyer, "/me");
    found.push(...(await axeViolations(buyer, "buyer /me")));
    await buyer.context().close();

    await gotoReady(hostPage, "/host");
    found.push(...(await axeViolations(hostPage, "host /host")));
    await gotoReady(hostPage, replaceUrl);
    await hostPage.getByTestId("edit-photos").click();
    await expect(hostPage.getByTestId("photo-tile").first()).toBeVisible();
    found.push(...(await axeViolations(hostPage, "host Edit photos dialog")));
    await closeSheet(hostPage);

    // The upload-heavy pages use a host of their own (the upload rate limit is per user).
    const other = await ctxPage(browser, `${axeHost}@e2e.test`, "host");
    await fillComposer(other, { title: `Axe composer ${stamp}` });
    await addPhotos(other, [1, 2]);
    await other.getByTestId("photo-options-1").click();
    await expect(other.getByRole("group", { name: "Photo 1 options" })).toBeVisible();
    found.push(...(await axeViolations(other, "host composer with two tiles and a tile panel")));
    const ran = await ranBreak(browser, other, { photos: 2 });
    for (const [who, page] of [["anonymous", anon], ["holder", ran.buyer]] as const) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`${ran.url}/result`);
      await expect(page.getByTestId("winner")).toContainText("Top spot: line");
      await expect(page.getByTestId("prizes-block")).toBeVisible();
      found.push(...(await axeViolations(page, `${who} result page`)));
    }
    expect(found).toEqual([]);
  });
});
