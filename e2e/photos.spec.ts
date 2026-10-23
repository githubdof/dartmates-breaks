import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { composeBreakWithPhotos, gotoReady, loginAs } from "./helpers";

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
