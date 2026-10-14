import { describe, it, expect } from "vitest";
import { syncUser } from "./session";
import { toViewer } from "./viewer";
import { withTx } from "../../tests/helpers/db";
import { makeUser } from "../../tests/helpers/fixtures";

describe("toViewer", () => {
  it("builds the viewer from the row syncUser already returns (email included, no second query)", async () => {
    await withTx(async (tx) => {
      const u = await makeUser(tx, { role: "host" });
      const email = `${u.handle}@example.com`;
      const row = await syncUser(tx, u.id, email, false);
      expect(row.email).toBe(email);
      expect(toViewer(row)).toEqual({ id: u.id, handle: u.handle, displayName: u.handle, role: "host", email });
    });
  });
});
