import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = [/^\/$/, /^\/login(\/|$)/, /^\/auth\//, /^\/b\//, /^\/breaks(\/|$)/, /^\/h\//, /^\/legal(\/|$)/, /^\/api\//, /^\/test\//, /^\/dev\//, /^\/_next\//, /^\/favicon/];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (all) => { all.forEach(({ name, value }) => req.cookies.set(name, value)); res = NextResponse.next({ request: req }); all.forEach(({ name, value, options }) => res.cookies.set(name, value, options)); },
    },
  });
  const { data } = await supabase.auth.getUser(); // refreshes the cookie if needed
  const path = req.nextUrl.pathname;
  if (!data.user && !PUBLIC.some((re) => re.test(path))) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return res;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"] };
