import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DRAW_KEY_V1: z
    .string()
    .refine((s) => Buffer.from(s, "base64").length === 32, "DRAW_KEY_V1 must be 32 bytes base64"),
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
  return result.data;
}

// Lazy so test files can import parseEnv without a real env.
let cached: Env | undefined;
export function env(): Env {
  if (!cached) cached = parseEnv(process.env);
  return cached;
}
