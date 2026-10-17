import { afterEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { OgModel } from "@/domain/breaks/og";

// No database here: the break is found (mocked), so only the image step can fail. The preview must answer 404 like the
// missing-break path, never a 500 with a stack, whether the fonts cannot be read or the renderer throws.
let fonts: "missing" | "garbage" | "ok" = "ok";
vi.mock("@/db/client", () => ({ db: { transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn({}) } }));
vi.mock("@/domain/breaks/queries", () => ({ getBreakPage: async () => ({ break: { status: "open" } }) }));
vi.mock("@/domain/breaks/og", () => ({
  ogModel: (): OgModel => ({ title: "T", caption: "4 to go, $5 a line", hostedBy: "Hosted by @jim", kit: { dark: "blue", light: "yellow" }, heat: 0, cells: [{ number: 1, tone: "open" }], columns: 4 }),
}));
const fontList = () => {
  if (fonts === "missing") throw new Error("ENOENT: no such file or directory, open 'assets/og/Barlow-500.ttf'");
  return [{ name: "Barlow", data: Buffer.from("not a font"), weight: 500, style: "normal" }];
};
vi.mock("./fonts", () => ({ ogFonts: fontList, get OG_FONTS() { return fontList(); } }));
afterEach(() => { fonts = "ok"; });

const { GET } = await import("./route");
const get = (id: string) => GET(new Request(`http://localhost/b/${id}/og`), { params: Promise.resolve({ id }) });

describe("GET /b/{id}/og when the image cannot be drawn", () => {
  it("answers 404, never a 500, when a font file is missing", async () => {
    fonts = "missing";
    const r = await get(randomUUID());
    expect(r.status).toBe(404);
    expect(await r.text()).not.toMatch(/ENOENT|at /);
  });
  it("answers 404, never a 500 or a broken 200 stream, when the renderer throws", async () => {
    fonts = "garbage";
    const r = await get(randomUUID());
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).not.toBe("image/png");
  }, 30_000);
});
