import { describe, it, expect } from "vitest";
import type { ActionResult } from "@/lib/action-result";
import { runGiveBack } from "./give-back";

describe("runGiveBack: the give-back is recorded before the action, so its announcement never depends on render order", () => {
  it("records the numbers synchronously, before the action is called; done on success", async () => {
    const log: string[] = [];
    const run = runGiveBack([4, 11], async () => { log.push("call"); return { ok: true, data: undefined } as ActionResult<void>; }, {
      onStart: (n) => log.push(`start ${n.join(",")}`),
      onRefused: () => log.push("refused"),
    });
    expect(log).toEqual(["start 4,11", "call"]); // both before the first await resolves
    expect((await run).ok).toBe(true);
    expect(log).toEqual(["start 4,11", "call"]);
  });
  it("clears the record when the server refuses; keeps it when the action threw (it may have gone through)", async () => {
    const log: string[] = [];
    const h = { onStart: (n: number[]) => log.push(`start ${n.join(",")}`), onRefused: () => log.push("refused") };
    await runGiveBack([4], async () => ({ ok: false, code: "INVALID", message: "No." }) as ActionResult<void>, h);
    expect(log).toEqual(["start 4", "refused"]);
    log.length = 0;
    await expect(runGiveBack([4], async () => { throw new Error("offline"); }, h)).rejects.toThrow("offline");
    expect(log).toEqual(["start 4"]);
  });
});
