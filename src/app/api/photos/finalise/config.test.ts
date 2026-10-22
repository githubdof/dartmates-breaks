import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("finalise route config (photos spec §5.3)", () => {
  it("the route runs on Node for up to 30 s, and vercel.json keeps its keys while adding the function config", async () => {
    const route = await import("./route");
    expect([route.runtime, route.maxDuration, route.dynamic]).toEqual(["nodejs", 30, "force-dynamic"]);
    expect(Object.keys(route).sort()).toEqual(["POST", "dynamic", "maxDuration", "runtime"]);
    const v = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(v.crons).toContainEqual({ path: "/api/tick", schedule: "* * * * *" });
    expect(v.functions["src/app/api/photos/finalise/route.ts"]).toEqual({ maxDuration: 30 });
  });
});
