import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUCKETS, BUCKET_SETTINGS, MIB, publicVariantUrl, variantPath } from "@/storage/buckets";
import { photoStorage } from "@/storage/photo-storage";
import { clientStoragePolicies, ensureBuckets } from "@/storage/ensure-buckets";
import { photoStorageContract } from "../helpers/photo-storage-contract";

// GitHub CI runs test:ci on a bare postgres:16 service with no Storage. Everywhere else it runs against the local
// stack and fails loudly when Storage is down: run the README preflight first.
const STACK = process.env.GITHUB_ACTIONS !== "true";
const API = process.env.SUPABASE_URL!;
const SERVER = process.env.DB_SERVER_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322";
const client = (key: string) => createClient(API, key, { auth: { persistSession: false } });

describe.runIf(STACK)("Storage on the local stack (photos spec §5.5)", () => {
  photoStorageContract("Supabase", () => photoStorage());

  let admin: SupabaseClient, anon: SupabaseClient, member: SupabaseClient, memberId = "";
  const folder = randomUUID();
  const prefix = `${folder}/${randomBytes(16).toString("base64url")}`;
  const file = variantPath(prefix, 160);
  const body = randomBytes(256);
  const privateBuckets = [BUCKETS.draft, BUCKETS.archive] as const;

  beforeAll(async () => {
    admin = client(process.env.SUPABASE_SERVICE_ROLE_KEY!);
    anon = client(process.env.SUPABASE_ANON_KEY!);
    member = client(process.env.SUPABASE_ANON_KEY!);
    const email = `storage-${randomUUID()}@example.test`, password = randomBytes(18).toString("base64url");
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw made.error;
    memberId = made.data.user.id;
    const signedIn = await member.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    for (const b of [BUCKETS.draft, BUCKETS.public, BUCKETS.archive]) {
      const { error } = await admin.storage.from(b).upload(file, body, { contentType: "image/webp", cacheControl: "3600" });
      if (error) throw error;
    }
  });
  afterAll(async () => {
    for (const b of Object.values(BUCKETS)) {
      const { data } = await admin.storage.from(b).list(folder);
      await admin.storage.from(b).remove((data ?? []).map((o) => `${folder}/${o.name}`));
    }
    if (memberId) await admin.auth.admin.deleteUser(memberId);
  });

  it("has the four buckets as BUCKET_SETTINGS says, and a second setup run changes nothing", async () => {
    await ensureBuckets(admin);
    expect(await ensureBuckets(admin)).toEqual(Object.values(BUCKETS).map((bucket) => ({ bucket, action: "ok" })));
    for (const name of Object.values(BUCKETS)) {
      const { data, error } = await admin.storage.getBucket(name);
      expect(error).toBeNull();
      expect({ public: data!.public, fileSizeLimit: data!.file_size_limit, allowedMimeTypes: data!.allowed_mime_types })
        .toEqual({ ...BUCKET_SETTINGS[name], allowedMimeTypes: [...BUCKET_SETTINGS[name].allowedMimeTypes] });
    }
  });

  it("has no storage policy that lets anon or authenticated read, list or write", async () => {
    const sql = postgres(`${SERVER}/postgres`, { max: 1, prepare: false });
    try {
      expect(await clientStoragePolicies(sql)).toEqual([]);
    } finally {
      await sql.end();
    }
  });

  it("serves a public variant by URL to anyone, as image/webp with a one-hour cache", async () => {
    const res = await fetch(publicVariantUrl(prefix, 160));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toMatch(/max-age=3600/);
    expect(Buffer.compare(Buffer.from(await res.arrayBuffer()), body)).toBe(0);
  });

  it("lists nothing in photos to anon or a signed-in member", async () => {
    expect((await admin.storage.from(BUCKETS.public).list(folder)).data).toHaveLength(1);
    for (const who of [anon, member]) expect((await who.storage.from(BUCKETS.public).list(folder)).data ?? []).toEqual([]);
  });

  it("never serves photos-draft or photo-archive without a signature", async () => {
    for (const b of privateBuckets) {
      expect((await fetch(`${API}/storage/v1/object/public/${b}/${file}`)).status).not.toBe(200);
      for (const who of [anon, member]) {
        expect((await who.storage.from(b).download(file)).data).toBeNull();
        expect((await who.storage.from(b).createSignedUrl(file, 600)).data).toBeNull();
        expect((await who.storage.from(b).list(folder)).data ?? []).toEqual([]);
      }
    }
  });

  it("refuses uploads from anon and a signed-in member to every bucket, and signed upload URLs too", async () => {
    for (const b of Object.values(BUCKETS)) {
      for (const who of [anon, member]) {
        const contentType = b === BUCKETS.incoming ? "image/jpeg" : "image/webp";
        expect((await who.storage.from(b).upload(`${prefix}-probe.webp`, randomBytes(32), { contentType })).error).not.toBeNull();
        expect((await who.storage.from(b).createSignedUploadUrl(`${folder}/probe.jpg`)).data).toBeNull();
      }
      const { data } = await admin.storage.from(b).list(folder);
      expect((data ?? []).map((o) => o.name)).not.toContain(`${prefix.split("/")[1]}-probe.webp`);
    }
  });

  it("takes a signed upload into incoming once, up to 5 MB, images only", async () => {
    const sign = async (name: string) => (await admin.storage.from(BUCKETS.incoming).createSignedUploadUrl(name)).data!;
    const ok = await sign(`${folder}/ok.jpg`);
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/ok.jpg`, ok.token, randomBytes(1024), { contentType: "image/jpeg" })).error).toBeNull();
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/ok.jpg`, ok.token, randomBytes(1024), { contentType: "image/jpeg" })).error).not.toBeNull(); // no overwrite
    const big = await sign(`${folder}/big.jpg`);
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/big.jpg`, big.token, Buffer.alloc(5 * MIB + 1), { contentType: "image/jpeg" })).error).not.toBeNull();
    const html = await sign(`${folder}/page.jpg`);
    expect((await anon.storage.from(BUCKETS.incoming).uploadToSignedUrl(`${folder}/page.jpg`, html.token, Buffer.from("<html></html>"), { contentType: "text/html" })).error).not.toBeNull();
    // The public bucket takes nothing but WebP, even from the service role.
    expect((await admin.storage.from(BUCKETS.public).upload(`${prefix}-probe.webp`, randomBytes(32), { contentType: "image/png" })).error).not.toBeNull();
  });
});
