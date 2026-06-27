import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Single-user password gate. If APP_PASSWORD is unset (e.g. local dev), the app
// is open. When set (production), every route requires a valid auth cookie.
async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const pwd = process.env.APP_PASSWORD;
  if (!pwd) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // /api/cron is protected by its own CRON_SECRET, not the app password.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/cron")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("cpa_auth")?.value;
  if (token && token === (await sha256hex(pwd))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
