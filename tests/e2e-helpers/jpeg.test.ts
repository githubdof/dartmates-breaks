import sharp from "sharp";
import { expect, it } from "vitest";
import { jpeg } from "../../e2e/helpers";

it("jpeg(n) is an 800 × 600 JPEG, the same for the same n and different across n", async () => {
  const a = await jpeg(1);
  const b = await jpeg(2);
  expect(await sharp(a).metadata()).toMatchObject({ format: "jpeg", width: 800, height: 600 });
  expect((await jpeg(1)).equals(a)).toBe(true);
  expect(a.equals(b)).toBe(false);
});
