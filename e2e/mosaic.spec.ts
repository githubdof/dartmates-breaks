import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { FLIGHT_COLOURS, FLIGHT_SHAPES } from "../src/domain/flights";
import { composeBreak, gotoReady, loginAs } from "./helpers";
import { setFlight, setKit } from "./db";
import { longestMoment, MOMENT_CLEAR_MS } from "../src/components/grid/board-moments";

// Mosaic's privacy and motion claims in a real browser (Plan C Review Focus 1, 2 and 5).
const run = Date.now();

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((c) => c.close())); });

async function newPage(browser: Browser, email?: string, role: "member" | "host" = "member", viewport?: { width: number; height: number }): Promise<Page> {
  const mobile = viewport ? viewport.width < 640 : false;
  const ctx = await browser.newContext(viewport ? { viewport, isMobile: mobile, hasTouch: mobile } : {});
  contexts.push(ctx);
  const page = await ctx.newPage();
  if (email) await loginAs(page, email, role);
  return page;
}

/** Every flight name a cell must never say: the colour and shape labels (Mosaic §5 accessibility). */
const FLIGHT_WORDS = [...Object.values(FLIGHT_COLOURS).map((c) => c.label), ...Object.values(FLIGHT_SHAPES).map((s) => s.label)];

/**
 * Every accessible name on the page that carries a flight name, or a handle or an "@": always empty, for every viewer
 * (Plan C Global Constraints: "no aria-label ever contains a handle or a flight name"). The one exemption is for
 * handles inside `handleExempt` (the host's ledger names its rows' "Paid" buttons by handle, by design); flight names
 * have no exemption anywhere.
 */
async function badNames(page: Page, handles: string[], handleExempt?: string): Promise<string[]> {
  const labels = await page.locator("[aria-label]").evaluateAll((els, exempt) => els.map((e) => ({
    name: e.getAttribute("aria-label") ?? "",
    exempt: !!exempt && e.closest(exempt) !== null,
    cell: e.hasAttribute("data-cell"),
  })), handleExempt);
  // Never vacuous: the board's cells are among the labels read.
  expect(labels.filter((l) => l.cell).length).toBeGreaterThan(0);
  const flightWord = (n: string) => FLIGHT_WORDS.some((w) => new RegExp(`\\b${w}\\b`, "i").test(n));
  const handle = (n: string) => n.includes("@") || handles.some((h) => n.includes(h));
  return labels.filter((l) => flightWord(l.name) || (!l.exempt && handle(l.name))).map((l) => l.name);
}

/**
 * The kit view (Plan C e2e privacy assertion): every line renders, no data-flight and no --fc anywhere in the page (a
 * cell's own style or any element's), and no holder's handle anywhere in the page, the RSC payload included. (The
 * payload may carry the signed-in viewer's own flight, so the check is on the holders, not on the word "flight".)
 */
async function expectKitView(page: Page, cells: number, handles: string[]) {
  // The board's buttons only: legend mini cells are display-only [data-cell] elements too (Task 7).
  await expect(page.locator("button[data-cell]")).toHaveCount(cells);
  await expect(page.getByRole("group", { name: /^Lines/ })).toHaveAttribute("data-view", "kit");
  await expect(page.locator("[data-flight]")).toHaveCount(0);
  const withFc = await page.evaluate(() => [...document.querySelectorAll("[style]")].filter((e) => (e.getAttribute("style") ?? "").includes("--fc")).length);
  expect(withFc).toBe(0);
  const html = await page.content();
  for (const h of handles) expect(html).not.toContain(h);
}

test("strangers see the 50-line board in the host's kit, holders see the flights, and no name carries a handle or a flight", async ({ browser }) => {
  const hostHandle = `mk${run}`; const aliceHandle = `ma${run}`; const bobHandle = `mo${run}`;
  const host = await newPage(browser, `${hostHandle}@e2e.test`, "host");
  await setKit(hostHandle, { dark: "plum", light: "lime" });
  const url = await composeBreak(host, { title: `Mosaic ${run}`, lineCount: 50 });
  const alice = await newPage(browser, `${aliceHandle}@e2e.test`);
  await setFlight(aliceHandle, { colour: "yellow", shape: "kite" }); // light tier
  const bob = await newPage(browser, `${bobHandle}@e2e.test`);
  await setFlight(bobHandle, { colour: "blue", shape: "standard" }); // dark tier

  // alice holds lines 1 and 2 and says she sent them; bob holds line 3 and the host ticks it paid.
  await gotoReady(alice, url);
  await alice.getByTestId("cell-1").click();
  await alice.getByTestId("cell-2").click();
  await alice.getByTestId("claim-submit").click();
  await expect(alice.getByTestId("flight-line")).toContainText("This is your flight.");
  await alice.getByTestId("pay-sent").click();
  await expect(alice.getByTestId("pay-sheet")).toBeHidden();
  await gotoReady(bob, url);
  await bob.getByTestId("cell-3").click();
  await bob.getByTestId("claim-submit").click();
  await bob.getByRole("button", { name: "I'll pay later" }).click();
  await gotoReady(host, url);
  await host.getByTestId("host-tools").click();
  await host.getByTestId("ledger-row").filter({ hasText: bobHandle }).getByTestId("ledger-paid").click();
  await expect(host.getByTestId("paid-count")).toContainText("1 of 50 paid");
  await host.getByRole("button", { name: "Close" }).click();

  const holders = [aliceHandle, bobHandle];
  const anonymous = await newPage(browser);
  const stranger = await newPage(browser, `mz${run}@e2e.test`);
  for (const page of [anonymous, stranger]) {
    await gotoReady(page, url);
    await expectKitView(page, 50, holders);
    expect(await badNames(page, holders)).toEqual([]);
    await expect(page.getByTestId("cell-1")).toHaveAttribute("aria-label", "Line 1, taken");
    await expect(page.getByTestId("cell-3")).toHaveAttribute("aria-label", "Line 3, paid");
  }
  // A holder and the host see every holder's flight; no name on the page carries a flight, and none carries a handle
  // except the host ledger's "Paid" buttons (alice has no ledger, so nothing of hers is exempt).
  for (const [page, exempt] of [[alice, undefined], [host, '[data-testid="ledger"]']] as const) {
    await gotoReady(page, url);
    await expect(page.getByTestId("cell-1")).toHaveAttribute("data-flight", "yellow-kite");
    await expect(page.getByTestId("cell-2")).toHaveAttribute("data-flight", "yellow-kite");
    await expect(page.getByTestId("cell-3")).toHaveAttribute("data-flight", "blue-standard");
    await expect(page.getByTestId("cell-4")).not.toHaveAttribute("data-flight");
    // The positive control for the strangers' --fc check: a member-view cell sets it inline.
    await expect(page.getByTestId("cell-1")).toHaveAttribute("style", /--fc:/);
    expect(await badNames(page, holders, exempt)).toEqual([]);
  }
  // The List view is text only (Mosaic §5: "List rows carry handles as text, never glyphs").
  await alice.getByRole("radio", { name: "List" }).click();
  const list = alice.getByRole("list", { name: "Lines" });
  await expect(list).toContainText(`@${aliceHandle}`);
  await expect(list.locator("svg, [data-flight]")).toHaveCount(0);
});

test("the first claim as a stranger animates only the claimed cells, and nothing animates on load (Review Focus 2)", async ({ browser }) => {
  const host = await newPage(browser, `mc${run}@e2e.test`, "host");
  const url = await composeBreak(host, { title: `Moments ${run}`, lineCount: 12 });
  // Someone else first: a part-filled board, so the view switch turns their cells from kit faces to flight faces.
  const other = await newPage(browser, `md${run}@e2e.test`);
  await gotoReady(other, url);
  for (const n of [1, 2, 3, 4]) await other.getByTestId(`cell-${n}`).click();
  await other.getByTestId("claim-submit").click();
  await other.getByRole("button", { name: "I'll pay later" }).click();

  const carol = await newPage(browser, `me${run}@e2e.test`);
  // Record every moment any cell ever plays, from the first byte of the page on.
  await carol.addInitScript(() => {
    const seen: Record<string, string[]> = {};
    (window as unknown as { __moments: Record<string, string[]> }).__moments = seen;
    const note = (el: Element) => {
      const m = el.getAttribute("data-moment"); const n = el.getAttribute("data-cell");
      if (m && n) (seen[n] ??= []).push(m);
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && r.target instanceof Element) note(r.target);
        for (const node of r.addedNodes) {
          if (!(node instanceof Element)) continue;
          note(node);
          node.querySelectorAll("[data-moment]").forEach(note);
        }
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-moment"] });
  });
  const moments = () => carol.evaluate(() => (window as unknown as { __moments: Record<string, string[]> }).__moments);
  // Past every moment a render could start: the longest one, and the time the board keeps data-moment on a cell.
  const settle = () => carol.waitForTimeout(Math.max(longestMoment(), MOMENT_CLEAR_MS) + 200);

  // Load: the network idle, one frame, then long enough for any moment a mount effect or a frame could start.
  await gotoReady(carol, url);
  await carol.waitForLoadState("networkidle");
  await carol.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await settle();
  await expect(carol.locator("[data-flight]")).toHaveCount(0); // kit view: carol holds nothing yet
  expect(await moments()).toEqual({});
  await carol.getByTestId("cell-7").click();
  await carol.getByTestId("cell-8").click();
  await carol.getByTestId("claim-submit").click();
  await expect(carol.getByTestId("pay-sheet")).toBeVisible();
  await expect(carol.getByTestId("cell-1")).toHaveAttribute("data-flight", /.+/); // now the member view
  // The drop lands from whichever renders first, the claim's answer or the refreshed props (Task 11a). Wait for both:
  // the drops, then the refreshed server props ("You have …" comes only from the page's props), then past any moment
  // that last render could start, and only then read what played.
  await expect.poll(moments).toMatchObject({ 7: ["drop"], 8: ["drop"] });
  await expect(carol.getByTestId("you-have")).toHaveText("You have 7 and 8.");
  await carol.waitForLoadState("networkidle");
  await settle();
  const seen = await moments();
  expect(Object.keys(seen).sort()).toEqual(["7", "8"]);
  expect(Object.values(seen).flat().every((m) => m === "drop")).toBe(true);
});

test("/account: a host picks a kit and a member picks a flight, and the board wears both", async ({ browser }) => {
  const host = await newPage(browser, `mq${run}@e2e.test`, "host");
  await host.goto("/account");
  const picker = host.getByTestId("kit-picker");
  await picker.getByRole("radio", { name: "Petrol", exact: true }).check();
  await picker.getByRole("radio", { name: "Orange", exact: true }).check();
  await expect(picker.getByTestId("kit-petrol-orange")).toBeVisible(); // the framed preview of the pair
  await host.getByTestId("kit-save").click();
  await expect(host.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await host.reload();
  await expect(host.getByTestId("kit-picker").getByTestId("kit-petrol-orange")).toBeVisible();
  const url = await composeBreak(host, { title: `Kit ${run}`, lineCount: 4 });
  await gotoReady(host, url);
  const kitDark = await host.getByTestId("board-frame").evaluate((el) => getComputedStyle(el).getPropertyValue("--kit-dark").trim().toLowerCase());
  expect(kitDark).toBe(FLIGHT_COLOURS.petrol.face.toLowerCase());

  const member = await newPage(browser, `mp${run}@e2e.test`);
  await member.goto("/account");
  await member.getByTestId("flight-plum-pear").check();
  await member.getByTestId("flight-save").click();
  await expect(member.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await member.reload();
  await expect(member.getByTestId("flight-plum-pear")).toBeChecked();
  await gotoReady(member, url);
  await member.getByTestId("cell-2").click();
  await member.getByTestId("claim-submit").click();
  await expect(member.getByTestId("pay-sheet")).toBeVisible();
  // A chosen flight: the outcome no longer introduces it.
  await expect(member.getByTestId("flight-line")).toHaveCount(0);
  await member.getByRole("button", { name: "I'll pay later" }).click();
  await expect(member.getByTestId("cell-2")).toHaveAttribute("data-flight", "plum-pear");
});

/** The board rows' column count, the first cell's width and the pitch (a cell plus its wire), from the density section. */
async function boardGeometry(page: Page) {
  const rows = page.getByTestId("density").locator("[data-grid-rows]").first();
  const cols = await rows.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
  const first = await rows.locator(":scope > *").first().boundingBox();
  const second = await rows.locator(":scope > *").nth(1).boundingBox();
  const frame = await rows.boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  return { cols, cell: first!.width, pitch: second!.x - first!.x, rows: frame!.width, scroll: await page.evaluate(() => document.documentElement.scrollWidth) };
}

test("the 50-line board fits a 390 × 664 phone: eight 44.75 px cells on 1 px wires, the frame in the gutter, and the small won cell's sizes (Review Focus 5)", async ({ browser }) => {
  const page = await newPage(browser, undefined, "member", { width: 390, height: 664 });
  expect((await page.goto("/dev/components"))?.status()).toBe(200);
  // Recorded ruling 33: the rows are 365 px (3.5 px into each gutter), eight 44.75 px cells on 1 px wires. The cell keeps
  // the 44 pt floor, and the pitch (a cell plus its wire) is 45.75. The 12 px frame reaches 15.5 px into the 16 px
  // gutter: nothing scrolls sideways.
  const g = await boardGeometry(page);
  expect(g.cols).toBe(8);
  expect(g.cell).toBeGreaterThanOrEqual(44);
  expect(g.cell).toBeCloseTo(44.75, 1);
  expect(g.pitch).toBeCloseTo(45.75, 1);
  expect(g.rows).toBeCloseTo(365, 0);
  expect(g.scroll).toBeLessThanOrEqual(390);
  const top = page.getByTestId("density").getByRole("img", { name: "Line 23, top spot" });
  const sizes = await top.evaluate((el) => {
    const all = [...el.querySelectorAll("*")];
    const number = all.find((n) => n.children.length === 0 && n.textContent === "23");
    const disc = all.find((n) => {
      const r = n.getBoundingClientRect();
      return n.tagName.toLowerCase() !== "svg" && Math.abs(r.width - 26) < 0.6 && Math.abs(r.height - 26) < 0.6;
    });
    const glyph = all.find((n) => n.tagName.toLowerCase() === "svg" && n.getBoundingClientRect().width > 0);
    return { number: number ? getComputedStyle(number).fontSize : null, disc: disc !== undefined, glyph: glyph ? Math.round(glyph.getBoundingClientRect().width) : null };
  });
  // Under 56 px (Mosaic §5): the 26 px disc, a 14 px top-spot number, the 10 px glyph.
  expect(sizes).toEqual({ number: "14px", disc: true, glyph: 10 });
  // The feed card's thumbnail (96 px, 50 lines, 12 px cells) and the landing hero's (112 px): the top spot's disc keeps
  // a cream centre inside its double ring (Task 15a's parked check: measured here, not by eye).
  const discs = await page.getByTestId("thumb-sizes").locator('[data-place="1"] > span').evaluateAll((els) => els.map((e) => {
    const s = getComputedStyle(e);
    return { width: e.getBoundingClientRect().width, centre: e.getBoundingClientRect().width - 2 * parseFloat(s.borderTopWidth) };
  }));
  expect(discs).toHaveLength(2);
  for (const d of discs) expect(d.centre).toBeGreaterThanOrEqual(1);
});

test("at 360 the 50-line board keeps seven 47 px cells, with nothing scrolling sideways (recorded ruling 33)", async ({ browser }) => {
  const page = await newPage(browser, undefined, "member", { width: 360, height: 640 });
  expect((await page.goto("/dev/components"))?.status()).toBe(200);
  const g = await boardGeometry(page);
  expect(g.cols).toBe(7);
  expect(g.cell).toBeCloseTo(47, 1);
  expect(g.pitch).toBeCloseTo(48, 1);
  expect(g.scroll).toBeLessThanOrEqual(360);
});

test("a draft's head at 390: the Draft pill sits on the media row's line, and nothing scrolls sideways (Task 10's parked check)", async ({ browser }) => {
  const host = await newPage(browser, `mh${run}@e2e.test`, "host", { width: 390, height: 664 });
  const url = await composeBreak(host, { title: `Draft head ${run}`, lineCount: 50, intent: "draft" });
  await gotoReady(host, url);
  const media = await host.getByTestId("media-row").boundingBox();
  const pill = await host.locator("main section").first().getByText("Draft", { exact: true }).boundingBox();
  expect(media).not.toBeNull();
  expect(pill).not.toBeNull();
  // Same line: the pill's vertical centre within the media text's line box.
  const mid = pill!.y + pill!.height / 2;
  expect(mid).toBeGreaterThanOrEqual(media!.y);
  expect(mid).toBeLessThanOrEqual(media!.y + media!.height);
  expect(pill!.x + pill!.width).toBeLessThanOrEqual(390 - 16);
  expect(await host.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the flight picker at 390: eight 44.75 px cells (the 44 pt floor), nothing scrolling sideways", async ({ browser }) => {
  const page = await newPage(browser, `mf${run}@e2e.test`, "member", { width: 390, height: 664 });
  await page.goto("/account");
  const cells = page.getByTestId("flight-picker").locator('label:has(input[name="flight"])');
  await expect(cells).toHaveCount(32);
  // A cell is its face plus its 1 px right wire (border-box): 45.75 wide, a 44.75 px face, as the board's (§8).
  const geo = await cells.evaluateAll((els) => els.slice(0, 2).map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.x, width: r.width, face: r.width - parseFloat(getComputedStyle(e).borderRightWidth) };
  }));
  expect(geo[0].face).toBeGreaterThanOrEqual(44);
  expect(geo[0].face).toBeCloseTo(44.75, 1);
  expect(geo[1].x - geo[0].x).toBeCloseTo(45.75, 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("the flight picker's focused cell rises above its neighbours, so its ring is never painted over (WCAG 2.4.7 / 2.4.11)", async ({ browser }) => {
  const page = await newPage(browser, `mg${run}@e2e.test`, "member", { width: 390, height: 664 });
  await page.goto("/account");
  const grid = page.getByTestId("flight-picker");
  // Keyboard focus moves within the radio group: the focused cell's label stacks above the next cell.
  const checked = grid.locator("input:checked");
  await checked.focus();
  await page.keyboard.press("ArrowRight");
  const z = await grid.locator("input:focus-visible").evaluate((input) => getComputedStyle(input.closest("label")!).zIndex);
  expect(z).toBe("10");
});
