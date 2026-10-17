import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { withTx } from "../../../tests/helpers/db";
import { makeUser, makeBreak, openBreakWithLines, drawnBreak } from "../../../tests/helpers/fixtures";
import { claimLines } from "@/domain/lines/commands";
import type { Caller } from "@/domain/types";
import { readBreakView } from "./page-view";

const c = (u: { id: string }, role: Caller["role"] = "member"): Caller => ({ id: u.id, role, onboarded: true, banned: false });
const now = () => new Date();

describe("readBreakView", () => {
  it("hides a draft from everyone but its host and admins, and a missing break from everyone", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const member = await makeUser(tx); const admin = await makeUser(tx, { role: "admin" });
      const draft = await makeBreak(tx, { hostId: host.id });
      expect(await readBreakView(tx, draft.id, null, now())).toBeNull();
      expect(await readBreakView(tx, draft.id, { id: member.id, role: "member" }, now())).toBeNull();
      expect((await readBreakView(tx, draft.id, { id: host.id, role: "host" }, now()))?.page.break.id).toBe(draft.id);
      expect((await readBreakView(tx, draft.id, { id: admin.id, role: "admin" }, now()))?.page.break.id).toBe(draft.id);
      expect(await readBreakView(tx, randomUUID(), { id: host.id, role: "host" }, now())).toBeNull();
    });
  });

  it("gives the ledger to the host only, and the viewer's unpaid count across breaks", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const b = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      const elsewhere = await openBreakWithLines(tx, { hostId: host.id, lineCount: 6 });
      await claimLines(tx, c(buyer), { breakId: b.id, numbers: [1, 2], batchId: randomUUID() });
      await claimLines(tx, c(buyer), { breakId: elsewhere.id, numbers: [4], batchId: randomUUID() });
      const anon = await readBreakView(tx, b.id, null, now());
      expect(anon).toMatchObject({ globalUnpaid: 0, top: null, ledger: [] });
      expect(anon!.trust.breaksRun).toBe(0);
      const asBuyer = await readBreakView(tx, b.id, { id: buyer.id, role: "member" }, now());
      expect(asBuyer).toMatchObject({ globalUnpaid: 3, ledger: [] });
      expect(anon!.viewerFlight).toBeNull();
      expect(asBuyer!.viewerFlight).toMatchObject({ chosen: false });
      expect(asBuyer!.viewerFlight!.flight.colour).toMatch(/^(petrol|blue|plum|yellow|orange|lime|sky|pink)$/);
      const asHost = await readBreakView(tx, b.id, { id: host.id, role: "host" }, now());
      expect(asHost!.ledger.map((r) => r.ownerId)).toEqual([buyer.id]);
    });
  });

  it("reads the top spot of a ran break", async () => {
    await withTx(async (tx) => {
      const host = await makeUser(tx, { role: "host" }); const buyer = await makeUser(tx);
      const d = await drawnBreak(tx, { hostId: host.id, buyerIds: [buyer.id] });
      const v = await readBreakView(tx, d.id, null, now());
      expect(v!.top).toEqual({ line: d.ranking[0], handle: buyer.handle });
      expect(v!.trust.breaksRun).toBe(1);
    });
  });
});
