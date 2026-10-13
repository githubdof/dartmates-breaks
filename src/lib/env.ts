import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DRAW_KEY_V1: z
    .string()
    .refine((s) => Buffer.from(s, "base64").length === 32, "DRAW_KEY_V1 must be 32 bytes base64"),
  IP_HASH_KEY: z
    .string()
    .refine((s) => Buffer.from(s, "base64").length === 32, "IP_HASH_KEY must be 32 bytes base64"),
  CRON_SECRET: z.string().min(1),
  APP_URL: z.string().url(),
  ADMIN_EMAILS: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  assertDeployEnv(source);
  return result.data;
}

/** Test-only switches must never reach a Vercel deploy (production or preview). */
export function assertDeployEnv(source: Record<string, string | undefined>): void {
  if (!source.VERCEL_ENV) return;
  const bad = [source.BEACON === "fake" && "BEACON=fake", source.E2E_SECRET && "E2E_SECRET"].filter(Boolean);
  if (bad.length) throw new Error(`Invalid environment: ${bad.join(" and ")} must not be set on Vercel (VERCEL_ENV=${source.VERCEL_ENV}); they are for local and CI runs only`);
}

// Lazy so test files can import parseEnv without a real env.
let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
