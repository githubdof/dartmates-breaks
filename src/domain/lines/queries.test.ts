import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { claimLines, markPaid, markSent, addBonusLine } from "./commands";
import { myLines, waitingOnHost } from "./queries";
import { awards, breakItems, breaks, draws, events, lines, prizes } from "@/db/schema";
import type { Caller } from "@/domain/types";
import type { Tx } from "@/db/client";

/** Items and prizes are locked once a draw is requested: step the ran break back to closed to add a rank, then return it. */
const addAfterDraw = async (tx: Tx, breakId: string, add: () => Promise<unknown>) => {
  await tx.update(breaks).set({ status: "filled" }).where(eq(breaks.id, breakId));
  await add();
  await tx.update(breaks).set({ status: "drawn" }).where(eq(breaks.id, breakId));
};
const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const claim = (tx: Tx, u: { id: string }, breakId: string, numbers: number[]) => claimLines(tx, c(u), { breakId, numbers, batchId: randomUUID() });
const pay = (tx: Tx, host: { id: string }, breakId: string, number: number, owner: { id: string }) =>
  markPaid(tx, c(host, "host"), { breakId, number, expectedOwnerId: owner.id });

describe("myLines", () => {
  it("owes only unsent lines and wins only from the active draw (Review Focus 2)", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx); const other = await makeUser(tx);
      const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 10, linePriceCents: 500 });
      await claim(tx, buyer, a.id, [3, 5, 8]);
      await markSent(tx, c(buyer), { breakId: a.id, numbers: [3] });
      await pay(tx, host, a.id, 8, buyer);
      await tx.execute(sql`update lines set claimed_at = now() - interval '30 hours' where break_id = ${a.id} and number = 5`);
      await addBonusLine(tx, c(host, "host"), { breakId: a.id, ownerId: buyer.id }); // line 11, free and paid
      await claim(tx, other, a.id, [1]);
      await tx.execute(sql`update breaks set opened_at = now() - interval '2 hours' where id = ${a.id}`);
      const won = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 2 });

      const now = new Date();
      const groups = await myLines(tx, buyer.id, now);
      expect(groups.map((g) => g.breakId)).toEqual([won.id, a.id]);
      const ga = groups[1];
      expect(ga).toMatchObject({ status: "open", unsent: [5], sent: [3], paid: [8, 11], owedCents: 500, late: true, awards: [], ranAt: null, earlier: false });
      expect(ga.lines).toEqual([
        { number: 3, state: "sent", bonus: false },
        { number: 5, state: "taken", bonus: false },
        { number: 8, state: "paid", bonus: false },
        { number: 11, state: "paid", bonus: true },
      ]);
      const [five] = await tx.select({ claimedAt: lines.claimedAt }).from(lines).where(sql`${lines.breakId} = ${a.id} and ${lines.number} = 5`);
      expect(ga.payBy?.getTime()).toBe(five.claimedAt!.getTime() + 24 * 3_600_000);
      expect(ga.host).toMatchObject({ id: host.id, handle: host.handle, displayName: host.handle });

      const gw = groups[0];
      expect(gw).toMatchObject({ status: "drawn", owedCents: 0, payBy: null, late: false, awards: [{ rank: 1, itemName: "Darts", choice: false, shippedAt: null }] });
      expect(gw.awards[0].pickedAt).toBeInstanceOf(Date);
      expect(gw.ranAt).toBeInstanceOf(Date);
      // Eight days on, the ran break has moved under "Earlier"; the open one never does.
      const later = await myLines(tx, buyer.id, new Date(now.getTime() + 8 * 86_400_000));
      expect(later.map((g) => g.earlier)).toEqual([true, false]);

      await tx.update(draws).set({ voidedAt: new Date(), voidedBy: host.id, voidReason: "test" }).where(eq(draws.id, won.drawId));
      const voided = (await myLines(tx, buyer.id, now)).find((g) => g.breakId === won.id)!;
      expect(voided.awards).toEqual([]);
      expect(voided.ranAt).toBeNull();
      expect((await myLines(tx, other.id, now)).map((g) => g.breakId)).toEqual([a.id]);
    });
  });

  it("shows a choice prize as a choice until the winner picks, and never hides it under Earlier", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 2, extraTopChoice: "Chronos 24g" });
      const [g] = await myLines(tx, buyer.id, new Date());
      expect(g.breakId).toBe(d.id);
      expect(g.awards).toMatchObject([{ rank: 1, itemName: null, choice: true, pickedAt: null }]);
      // "Won. Tell Jim your choice." is the winner's only call to action: eight days on it is still in the recent group.
      const [later] = await myLines(tx, buyer.id, new Date(Date.now() + 8 * 86_400_000));
      expect(later.earlier).toBe(false);
    });
  });

  it("dates a cancelled break by its cancel event, and keeps one with lines still unpaid in the recent group", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
      // Opened 8 days ago, cancelled 8 days ago, every line of the buyer's paid: Earlier.
      const old = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, old.id, [1]); await pay(tx, host, old.id, 1, buyer);
      // Opened 8 days ago, cancelled today, paid: current (the cancel time counts, not the open time).
      const fresh = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, fresh.id, [1]); await pay(tx, host, fresh.id, 1, buyer);
      // Cancelled 8 days ago but line 1 never paid: current (something is still pending).
      const unpaid = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, unpaid.id, [1]);
      // Cancelled with no cancel event (no cancel command exists yet): current.
      const silent = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, silent.id, [1]); await pay(tx, host, silent.id, 1, buyer);
      for (const b of [old, fresh, unpaid, silent]) {
        await tx.update(breaks).set({ status: "cancelled", openedAt: eightDaysAgo }).where(eq(breaks.id, b.id));
      }
      await tx.insert(events).values([
        { breakId: old.id, actorId: host.id, type: "break.cancelled", createdAt: eightDaysAgo },
        { breakId: fresh.id, actorId: host.id, type: "break.cancelled" },
        { breakId: unpaid.id, actorId: host.id, type: "break.cancelled", createdAt: eightDaysAgo },
      ]);
      const by = Object.fromEntries((await myLines(tx, buyer.id, new Date())).map((g) => [g.breakId, g.earlier]));
      expect(by).toEqual({ [old.id]: true, [fresh.id]: false, [unpaid.id]: false, [silent.id]: false });
    });
  });

  it("keeps every award the viewer won, and stays recent while any choice is unpicked", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      // The sole buyer wins rank 1 (Darts, fixed at draw time). Rank 2 is a choice set the buyer also won.
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 2 });
      await addAfterDraw(tx, d.id, async () => {
        const items = await tx.insert(breakItems).values([{ breakId: d.id, name: "Chronos 24g" }, { breakId: d.id, name: "Gerwyn 22g" }]).returning();
        await tx.insert(prizes).values(items.map((i) => ({ breakId: d.id, rank: 2, itemId: i.id })));
      });
      await tx.insert(awards).values({ drawId: d.drawId, breakId: d.id, rank: 2, winnerId: buyer.id, itemId: null, pickedAt: null });
      const later = new Date(Date.now() + 8 * 86_400_000);
      const [g] = await myLines(tx, buyer.id, later);
      expect(g.awards).toMatchObject([
        { rank: 1, itemName: "Darts", choice: false },
        { rank: 2, itemName: null, choice: true, pickedAt: null },
      ]);
      expect(g.earlier).toBe(false);
      // Once the winner picks, nothing is pending: the break ages into Earlier, shipped or not.
      await tx.update(awards).set({ pickedAt: new Date() }).where(sql`${awards.breakId} = ${d.id} and ${awards.rank} = 2`);
      const [picked] = await myLines(tx, buyer.id, later);
      expect(picked.awards[1]).toMatchObject({ choice: true, shippedAt: null });
      expect(picked.awards[1].pickedAt).toBeInstanceOf(Date);
      expect(picked.earlier).toBe(true);
    });
  });

  it("does not take a mini-break spot for a choice", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id], lineCount: 2 });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await tx.update(breaks).set({ kind: "mini" }).where(eq(breaks.id, mini.id));
      await addAfterDraw(tx, d.id, () => tx.insert(prizes).values({ breakId: d.id, rank: 2, parentBreakId: mini.id, spotCount: 1 }));
      await tx.insert(awards).values({ drawId: d.drawId, breakId: d.id, rank: 2, winnerId: buyer.id, itemId: null, pickedAt: null });
      const [g] = await myLines(tx, buyer.id, new Date(Date.now() + 8 * 86_400_000));
      expect(g.awards).toMatchObject([{ rank: 1, choice: false }, { rank: 2, itemName: null, choice: false }]);
      expect(g.earlier).toBe(true);
    });
  });

  it("keeps a break with only sent, unpaid lines in the recent group", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      await claim(tx, buyer, b.id, [2]); await markSent(tx, c(buyer), { breakId: b.id, numbers: [2] });
      await tx.update(breaks).set({ status: "cancelled", openedAt: eightDaysAgo }).where(eq(breaks.id, b.id));
      await tx.insert(events).values({ breakId: b.id, actorId: host.id, type: "break.cancelled", createdAt: eightDaysAgo });
      const [g] = await myLines(tx, buyer.id, new Date());
      expect(g).toMatchObject({ unsent: [], sent: [2], owedCents: 0, payBy: null, earlier: false });
    });
  });

  it("is empty for someone who holds no line", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      expect(await myLines(tx, u.id, new Date())).toEqual([]);
    });
  });
});

describe("waitingOnHost", () => {
  it("groups sent, unpaid lines by buyer and break across the host's breaks, oldest sent first", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const otherHost = await makeUser(tx, { role: "host" });
      const alice = await makeUser(tx); const bob = await makeUser(tx); const carol = await makeUser(tx);
      const a = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 500 });
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6, linePriceCents: 700 });
      const elsewhere = await openBreakWithLines(tx, { hostId: otherHost.id, lineCount: 4 });
      await claim(tx, alice, a.id, [1, 2]); await markSent(tx, c(alice), { breakId: a.id, numbers: [1, 2] });
      await claim(tx, bob, b.id, [3, 4]); await markSent(tx, c(bob), { breakId: b.id, numbers: [3] });
      await claim(tx, carol, a.id, [5]); await markSent(tx, c(carol), { breakId: a.id, numbers: [5] }); await pay(tx, host, a.id, 5, carol);
      await claim(tx, alice, elsewhere.id, [1]); await markSent(tx, c(alice), { breakId: elsewhere.id, numbers: [1] });
      await tx.execute(sql`update lines set sent_at = now() - interval '2 hours' where break_id = ${b.id} and number = 3`);
      await tx.execute(sql`update lines set sent_at = now() - interval '1 hour' where break_id = ${a.id} and number in (1, 2)`);
      await tx.execute(sql`update users set payment_name = 'Robert B' where id = ${bob.id}`);

      const rows = await waitingOnHost(tx, host.id);
      expect(rows.map((r) => [r.breakId, r.ownerId])).toEqual([[b.id, bob.id], [a.id, alice.id]]);
      expect(rows[0]).toMatchObject({ breakTitle: b.title, handle: bob.handle, paymentName: "Robert B", sent: [3], sentCents: 700 });
      expect(rows[1]).toMatchObject({ breakTitle: a.title, sent: [1, 2], sentCents: 1000, paymentName: null });
      expect(await waitingOnHost(tx, otherHost.id)).toHaveLength(1);
    });
  });

  it("includes closed (filled) breaks and leaves out ran and mini breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const filled = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      const ran = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      const mini = await openBreakWithLines(tx, { hostId: host.id, lineCount: 4 });
      for (const b of [filled, ran, mini]) {
        await claim(tx, buyer, b.id, [1]); await markSent(tx, c(buyer), { breakId: b.id, numbers: [1] });
      }
      await tx.update(breaks).set({ status: "filled" }).where(eq(breaks.id, filled.id));
      await tx.update(breaks).set({ status: "drawn" }).where(eq(breaks.id, ran.id));
      await tx.update(breaks).set({ kind: "mini" }).where(eq(breaks.id, mini.id));
      const rows = await waitingOnHost(tx, host.id);
      expect(rows.map((r) => r.breakId)).toEqual([filled.id]);
    });
  });
});
