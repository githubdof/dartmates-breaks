import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { claimLines, markPaid, markSent, addBonusLine } from "@/domain/lines/commands";
import { draws, hostProfiles, users } from "@/db/schema";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";
import { listFeed, feedThumbs, feedHosts, latestRanBreak, isFeedSort, type FeedSort } from "./feed";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const claim = (tx: Tx, u: { id: string }, breakId: string, numbers: number[]) => claimLines(tx, c(u), { breakId, numbers, batchId: randomUUID() });
const pay = (tx: Tx, host: { id: string }, breakId: string, number: number, owner: { id: string }) =>
  markPaid(tx, c(host, "host"), { breakId, number, expectedOwnerId: owner.id });
const openedMinutesAgo = (tx: Tx, id: string, minutes: number) =>
  tx.execute(sql`update breaks set opened_at = now() - make_interval(mins => ${minutes}::int) where id = ${id}`);

describe("listFeed", () => {
  it("sorts: filling fast counts numbered lines paid in the last 24 h only (Review Focus 1)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      // A: lines 1 and 2 paid 25 h ago, plus a bonus line paid now. Open: 2.
      const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4, linePriceCents: 500 });
      await claim(tx, buyer, a.id, [1, 2]);
      await pay(tx, host, a.id, 1, buyer); await pay(tx, host, a.id, 2, buyer);
      await tx.execute(sql`update lines set paid_at = now() - interval '25 hours' where break_id = ${a.id} and number in (1, 2)`);
      await addBonusLine(tx, c(host, "host"), { breakId: a.id, ownerId: buyer.id });
      // B: line 1 paid now, line 2 sent. Open: 4.
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 500 });
      await claim(tx, buyer, b.id, [1, 2]);
      await pay(tx, host, b.id, 1, buyer);
      await markSent(tx, c(buyer), { breakId: b.id, numbers: [2] });
      // C: nothing claimed, opened last. Open: 6.
      const cc = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 500 });
      await openedMinutesAgo(tx, a.id, 30); await openedMinutesAgo(tx, b.id, 20); await openedMinutesAgo(tx, cc.id, 10);

      const ids = async (sort: FeedSort) => (await listFeed(tx, { sort, hostHandle: host.handle, now: new Date() })).map((r) => r.id);
      expect(await ids("filling")).toEqual([b.id, cc.id, a.id]);
      expect(await ids("almost")).toEqual([a.id, b.id, cc.id]);
      expect(await ids("newest")).toEqual([cc.id, b.id, a.id]);

      const rows = await listFeed(tx, { sort: "newest", hostHandle: host.handle, now: new Date() });
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(by[a.id]).toMatchObject({ open: 2, taken: 0, paid: 2, paidLastDay: 0, lineCount: 4, linePriceCents: 500 });
      expect(by[b.id]).toMatchObject({ open: 4, taken: 1, paid: 1, paidLastDay: 1 });
      expect(by[cc.id]).toMatchObject({ open: 6, taken: 0, paid: 0, paidLastDay: 0 });
      expect(by[a.id].host).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle, breaksRun: 0 });
      expect(by[a.id].host.since).toBeInstanceOf(Date);
      expect(by[a.id].openedAt).toBeInstanceOf(Date);
    });
  });

  it("dates the host's runs as hostTrust does: from the first ran break, else from when the host joined", async () => {
    await withTx(async (tx) => {
      const ran = await makeUser(tx, { role: "host" }); const fresh = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await tx.execute(sql`update users set created_at = '2025-01-10T12:00:00Z' where id in (${ran.id}, ${fresh.id})`);
      await drawnBreak(tx, { hostId: ran.id, buyerIds: [buyer.id] });
      await openBreakWithLines(tx, { hostId: ran.id, lineCount: 4 });
      await openBreakWithLines(tx, { hostId: fresh.id, lineCount: 4 });
      const [r] = await listFeed(tx, { sort: "newest", hostHandle: ran.handle, now: new Date() });
      const [f] = await listFeed(tx, { sort: "newest", hostHandle: fresh.handle, now: new Date() });
      expect(Date.now() - r.host.since.getTime()).toBeLessThan(3_600_000);
      expect(f.host.since.toISOString()).toBe("2025-01-10T12:00:00.000Z");
    });
  });

  it("lists open main breaks only: never drafts, closed, ran or mini breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const open = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await makeBreak(tx, { hostId: host.id }); // a draft
      const mini = await makeBreak(tx, { hostId: host.id, kind: "mini" });
      await tx.execute(sql`update breaks set status = 'open', opened_at = now() where id = ${mini.id}`);
      await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const closed = await openBreakWithLines(tx, { hostId: host.id, lineCount: 2 });
      await claim(tx, buyer, closed.id, [1, 2]);
      await pay(tx, host, closed.id, 1, buyer); await pay(tx, host, closed.id, 2, buyer);
      const rows = await listFeed(tx, { sort: "newest", hostHandle: host.handle, now: new Date() });
      expect(rows.map((r) => r.id)).toEqual([open.id]);
      expect(rows[0].host.breaksRun).toBe(1);
    });
  });

  it("filters by host handle, ignoring case, and answers nothing for an unknown handle", async () => {
    await withTx(async (tx) => {
      const jim = await makeUser(tx, { role: "host" }); const ann = await makeUser(tx, { role: "host" });
      const j = await openBreakWithLines(tx, { hostId: jim.id, lineCount: 4 });
      const a = await openBreakWithLines(tx, { hostId: ann.id, lineCount: 4 });
      const now = new Date();
      expect((await listFeed(tx, { sort: "newest", hostHandle: jim.handle.toUpperCase(), now })).map((r) => r.id)).toEqual([j.id]);
      expect((await listFeed(tx, { sort: "newest", hostHandle: ann.handle, now })).map((r) => r.id)).toEqual([a.id]);
      expect(await listFeed(tx, { sort: "newest", hostHandle: "nobody_here_x", now })).toEqual([]);
      expect((await listFeed(tx, { sort: "newest", now, limit: 200 })).map((r) => r.id)).toEqual(expect.arrayContaining([j.id, a.id]));
    });
  });
});

describe("banned hosts", () => {
  it("their open breaks leave the feed and the host filter", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      const now = new Date();
      expect((await listFeed(tx, { sort: "newest", hostHandle: host.handle, now })).map((r) => r.id)).toEqual([b.id]);
      await tx.update(users).set({ bannedAt: now }).where(eq(users.id, host.id));
      expect(await listFeed(tx, { sort: "newest", hostHandle: host.handle, now })).toEqual([]);
      expect((await listFeed(tx, { sort: "newest", now, limit: 200 })).map((r) => r.id)).not.toContain(b.id);
      expect((await feedHosts(tx)).map((h) => h.handle)).not.toContain(host.handle);
    });
  });
  it("their ran break is never the landing hero", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 4 });
      expect((await latestRanBreak(tx))?.breakId).toBe(d.id);
      await tx.update(users).set({ bannedAt: new Date() }).where(eq(users.id, host.id));
      expect((await latestRanBreak(tx))?.breakId).not.toBe(d.id);
    });
  });
});

describe("feedThumbs", () => {
  it("returns each line's state and nothing about who holds it", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, b.id, [2, 3, 4]);
      await markSent(tx, c(buyer), { breakId: b.id, numbers: [3] });
      await pay(tx, host, b.id, 4, buyer);
      await addBonusLine(tx, c(host, "host"), { breakId: b.id, ownerId: buyer.id });
      const missing = randomUUID();
      const thumbs = await feedThumbs(tx, [b.id, missing]);
      expect(thumbs.get(b.id)).toEqual([
        { number: 1, state: "open", bonus: false },
        { number: 2, state: "taken", bonus: false },
        { number: 3, state: "sent", bonus: false },
        { number: 4, state: "paid", bonus: false },
        { number: 5, state: "paid", bonus: true },
      ]);
      expect(thumbs.get(missing)).toEqual([]);
      const text = JSON.stringify([...thumbs.entries()]);
      expect(text).not.toContain(buyer.id);
      expect(text).not.toContain(buyer.handle);
      expect(await feedThumbs(tx, [])).toEqual(new Map());
    });
  });
});

describe("feedHosts", () => {
  it("lists the handles of hosts with an open main break, once each", async () => {
    await withTx(async (tx) => {
      const jim = await makeUser(tx, { role: "host" }); const idle = await makeUser(tx, { role: "host" });
      await openBreakWithLines(tx, { hostId: jim.id, lineCount: 4 });
      await openBreakWithLines(tx, { hostId: jim.id, lineCount: 4 });
      await makeBreak(tx, { hostId: idle.id });
      const hosts = (await feedHosts(tx)).map((h) => h.handle);
      expect(hosts.filter((h) => h === jim.handle)).toHaveLength(1);
      expect(hosts).not.toContain(idle.handle);
    });
  });
});

describe("latestRanBreak", () => {
  it("is the newest break with an active draw, and forgets a voided one", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 4 });
      const hero = await latestRanBreak(tx);
      expect(hero).toMatchObject({ breakId: d.id, title: d.title, lineCount: 4, topLine: d.ranking[0] });
      expect(hero!.ranAt).toBeInstanceOf(Date);
      await tx.update(draws).set({ voidedAt: new Date(), voidedBy: host.id, voidReason: "test" }).where(eq(draws.id, d.drawId));
      expect((await latestRanBreak(tx))?.breakId).not.toBe(d.id);
    });
  });
});

describe("isFeedSort", () => {
  it("accepts the three sorts and nothing else", () => {
    expect(["newest", "filling", "almost"].every(isFeedSort)).toBe(true);
    expect(isFeedSort("closing")).toBe(false);
    expect(isFeedSort(undefined)).toBe(false);
  });
});

describe("kit and heat on feed cards (Mosaic §6, §10)", () => {
  it("carries kit and heat and no flight (Review Focus 1)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const alice = await makeUser(tx);
      await tx.update(users).set({ flightColour: "pink", flightShape: "slim" }).where(eq(users.id, alice.id));
      await tx.insert(hostProfiles).values({ userId: host.id, kitDark: "petrol", kitLight: "orange" });
      const kitted = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, alice, kitted.id, [1, 2]);
      await markSent(tx, c(alice), { breakId: kitted.id, numbers: [1] });
      const other = await makeUser(tx, { role: "host" });
      const plain = await openBreakWithLines(tx, { hostId: other.id, lineCount: 4 });
      const rows = [
        ...(await listFeed(tx, { sort: "newest", hostHandle: host.handle, now: new Date() })),
        ...(await listFeed(tx, { sort: "newest", hostHandle: other.handle, now: new Date() })),
      ];
      const by = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(by[kitted.id]).toMatchObject({ open: 2, kit: { dark: "petrol", light: "orange" }, heat: 2 }); // 2 of 4 claimed
      expect(by[plain.id]).toMatchObject({ open: 4, kit: { dark: "blue", light: "yellow" }, heat: 0 }); // no profile: the default kit
      const text = JSON.stringify(rows);
      expect(text).not.toMatch(/flight|pink|slim/);
      expect(text).not.toContain(alice.id);
      expect(text).not.toContain(alice.handle);
    });
  });
});

const setKit = (tx: Tx, hostId: string, dark: string, light: string) =>
  tx.execute(sql`insert into host_profiles (user_id, kit_dark, kit_light) values (${hostId}::uuid, ${dark}, ${light})
    on conflict (user_id) do update set kit_dark = excluded.kit_dark, kit_light = excluded.kit_light`);
const setFlight = (tx: Tx, userId: string, colour: string, shape: string) =>
  tx.execute(sql`update users set flight_colour = ${colour}, flight_shape = ${shape} where id = ${userId}::uuid`);
/** Nothing a flight could be read from: the key itself, and the colour and shape words these tests give the members. */
const NO_FLIGHT = /flight|pink|slim|orange|pear/i;

describe("the landing hero in the host's kit (Mosaic §6, §8, §10; Review Focus 1)", () => {
  it("latestRanBreak carries the kit, heat 4, the prize places and the thumb cells, and no flight", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      await setKit(tx, host.id, "petrol", "sky");
      await setFlight(tx, buyer.id, "pink", "slim");
      await setFlight(tx, host.id, "orange", "pear");
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 4 });
      const hero = (await latestRanBreak(tx))!;
      expect(hero).toMatchObject({ breakId: d.id, topLine: d.ranking[0], kit: { dark: "petrol", light: "sky" }, heat: 4 });
      // The fixture's break has one prize, the top spot, so it has one place.
      expect(hero.places).toEqual([{ number: d.ranking[0], place: 1 }]);
      expect(hero.cells).toEqual([1, 2, 3, 4].map((number) => ({ number, state: "paid", bonus: false })));
      expect(JSON.stringify(hero)).not.toMatch(NO_FLIGHT);
      expect(JSON.stringify(hero)).not.toContain(buyer.id);
    });
  });
});
