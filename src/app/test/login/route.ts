import { NextResponse, type NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { supabaseAdmin, createServerSupabase } from "@/auth/supabase";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export async function GET(req: NextRequest) {
  const secret = process.env.E2E_SECRET;
  if (!secret || process.env.VERCEL_ENV === "production") return new NextResponse("Not found", { status: 404 });
  const q = req.nextUrl.searchParams;
  if (q.get("secret") !== secret) return new NextResponse("Forbidden", { status: 403 });
  const email = q.get("email");
  if (!email || !email.endsWith("@e2e.test")) return new NextResponse("email must end with @e2e.test", { status: 400 });
  const role = q.get("role") ?? "member";
  if (!["member", "host"].includes(role)) return new NextResponse("bad role", { status: 400 });
  const admin = supabaseAdmin();
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return new NextResponse(error.message, { status: 500 });
  const supabase = await createServerSupabase();
  const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "email" });
  if (vErr) return new NextResponse(vErr.message, { status: 500 });
  const handle = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").toLowerCase().slice(0, 20);
  await db.insert(users).values({ id: link.user.id, email, handle, displayName: handle, role, ageConfirmedAt: new Date() })
    .onConflictDoUpdate({ target: users.id, set: { role, handle: sql`coalesce(${users.handle}, ${handle})`, displayName: sql`coalesce(${users.displayName}, ${handle})`, ageConfirmedAt: sql`coalesce(${users.ageConfirmedAt}, now())` } });
  return NextResponse.redirect(new URL("/", req.url));
}
