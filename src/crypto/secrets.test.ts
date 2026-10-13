import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./secrets";

describe("secrets", () => {
  beforeAll(() => { process.env.DRAW_KEY_V1 = Buffer.alloc(32, 9).toString("base64"); });
  const breakId = "11111111-1111-4111-8111-111111111111";
  it("round-trips", () => {
    const s = new Uint8Array(32).fill(3);
    const { ciphertext, keyId } = encryptSecret(s, breakId);
    expect(keyId).toBe("v1");
    expect(decryptSecret(ciphertext, keyId, breakId)).toEqual(s);
  });
  it("fails to decrypt under a different break id (AAD)", () => {
    const { ciphertext, keyId } = encryptSecret(new Uint8Array(32), breakId);
    expect(() => decryptSecret(ciphertext, keyId, "22222222-2222-4222-8222-222222222222")).toThrow();
  });
  it("rejects unknown key ids", () => {
    const { ciphertext } = encryptSecret(new Uint8Array(32), breakId);
    expect(() => decryptSecret(ciphertext, "v9", breakId)).toThrow(/key id/);
  });
});
