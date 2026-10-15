import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { withTx } from "../../../tests/helpers/db";
import { makeUser } from "../../../tests/helpers/fixtures";
import { accountOf } from "./queries";

describe("accountOf", () => {
  it("reads the editable account fields, or null", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx);
      await tx.execute(sql`update users set payment_name = 'Pat Lee' where id = ${u.id}`);
      const a = await accountOf(tx, u.id);
      expect(a).toMatchObject({ handle: u.handle, displayName: u.handle, paymentName: "Pat Lee" });
      expect(a!.createdAt).toBeInstanceOf(Date);
      expect(await accountOf(tx, randomUUID())).toBeNull();
    });
  });
});
