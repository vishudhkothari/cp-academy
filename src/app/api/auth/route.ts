import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export async function POST(req: NextRequest) {
  const pwd = process.env.APP_PASSWORD;
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!pwd) return NextResponse.json({ ok: true }); // auth disabled
  if (!password || password !== pwd) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = createHash("sha256").update(pwd).digest("hex");
  const res = NextResponse.json({ ok: true });
  res.cookies.set("cpa_auth", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
