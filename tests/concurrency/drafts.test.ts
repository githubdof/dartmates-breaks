import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { makeUser, prize } from "../helpers/fixtures";
import { createDraft } from "@/domain/breaks/commands";
import { breaks, events, prizes } from "@/db/schema";
import type { Caller } from "@/domain/types";

const asHost = (u: { id: string }): Caller => ({ id: u.id, role: "host", onboarded: true, banned: false });
const input = { title: "Target Chronos", lineCount: 12, linePriceCents: 2000, items: [prize("Chronos 22g"), prize("Chronos 24g")] };

describe("concurrent draft saves", () => {
  it("the first photo and a Save racing on one client id make one break", async () => {
    const host = await db.transaction((tx) => makeUser(tx, { role: "host" }));
    const id = randomUUID();
    const results = await Promise.allSettled([0, 1].map((n) =>
      db.transaction((tx) => createDraft(tx, asHost(host), { ...input, title: `Race ${n}` }, { breakId: id }))));
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await db.select().from(breaks).where(sql`${breaks.id} = ${id}`)).toHaveLength(1);
    const created = await db.select().from(events).where(sql`${events.breakId} = ${id} and ${events.type} = 'break.created'`);
    expect(created).toHaveLength(1);
    expect(await db.select().from(prizes).where(sql`${prizes.breakId} = ${id}`)).toHaveLength(input.items.length);
  });
});
