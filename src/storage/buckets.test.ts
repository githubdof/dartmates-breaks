import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { BUCKETS, BUCKET_SETTINGS, MIB, PREFIX_PATTERN, VARIANT_WIDTHS, publicVariantUrl, variantPath } from "./buckets";

const P = "0b6c2f6e-5d1a-4c4e-9a59-3f0f3c1d2e4f/AbCdEfGhIjKlMnOpQrSt_-";

/** `[section]` → its body, by splitting on section headers (no TOML dependency for one test). */
function tomlSections(text: string): Record<string, string> {
  return Object.fromEntries(text.split(/^(?=\[)/m).filter((s) => s.startsWith("[")).map((s) => [s.slice(1, s.indexOf("]")), s]));
}

describe("photo storage names (photos spec §5.3, §5.5)", () => {
  it("names the four buckets and the three variant widths", () => {
    expect(BUCKETS).toEqual({ incoming: "incoming", draft: "photos-draft", public: "photos", archive: "photo-archive" });
    expect(VARIANT_WIDTHS).toEqual([160, 640, 1600]);
  });

  it("takes a break id and 22 url-safe characters as a prefix, nothing else", () => {
    expect(PREFIX_PATTERN.test(P)).toBe(true);
    for (const bad of ["../etc/passwd", `${P}x`, P.replace("/", "//"), P.slice(0, -1), `${P.split("/")[0]}/AbCdEfGhIjKlMnOpQrSt.-`, ""]) {
      expect(PREFIX_PATTERN.test(bad)).toBe(false);
    }
  });

  it("builds variant paths and public URLs from a valid prefix only", () => {
    expect(variantPath(P, 640)).toBe(`${P}-640.webp`);
    expect(publicVariantUrl(P, 1600)).toBe(`${process.env.SUPABASE_URL}/storage/v1/object/public/photos/${P}-1600.webp`);
    expect(() => variantPath("../x", 160)).toThrow();
    expect(() => publicVariantUrl("../x", 160)).toThrow();
  });

  it("keeps supabase/config.toml's buckets equal to BUCKET_SETTINGS, with Storage on", () => {
    const s = tomlSections(readFileSync("supabase/config.toml", "utf8"));
    expect(s["storage"]).toMatch(/^enabled = true$/m);
    expect(s["storage.image_transformation"]).toBeUndefined(); // billed per transformation; plain <img> + srcset (spec §5.5)
    for (const name of Object.values(BUCKETS)) {
      const body = s[`storage.buckets.${name}`];
      expect(body, name).toBeDefined();
      const settings = BUCKET_SETTINGS[name];
      expect(body).toMatch(new RegExp(`^public = ${settings.public}$`, "m"));
      expect(Number(/^file_size_limit = "(\d+)MiB"$/m.exec(body)?.[1]) * MIB).toBe(settings.fileSizeLimit);
      const mimes = /^allowed_mime_types = \[([^\]]*)\]$/m.exec(body)?.[1] ?? "";
      expect([...mimes.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual(settings.allowedMimeTypes);
      expect(body).not.toMatch(/objects_path/); // nothing is seeded into a photo bucket
    }
    expect(BUCKET_SETTINGS.incoming.fileSizeLimit).toBe(5 * 1024 * 1024);
    expect(BUCKET_SETTINGS.photos).toEqual({ public: true, fileSizeLimit: 5 * MIB, allowedMimeTypes: ["image/webp"] });
    expect(Object.values(BUCKET_SETTINGS).filter((b) => b.public)).toHaveLength(1);
  });
});
