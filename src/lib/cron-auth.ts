import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/** True when the request carries `Authorization: Bearer <CRON_SECRET>`, compared in constant time (Vercel Cron). */
export function cronAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${env().CRON_SECRET}`;
  return auth.length === expected.length && timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
}
