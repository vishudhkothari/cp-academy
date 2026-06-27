import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rebuildCatalogAndPath } from "@/lib/sources/sync";

// Manual catalog + curated-path rebuild. Heavy (fetches the full CF problemset +
// AtCoder set and rebuilds every ladder), so it's a route with a long
// maxDuration rather than a server action. Reachable only by the logged-in
// browser (the app middleware gates it under APP_PASSWORD when set).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const r = await rebuildCatalogAndPath(prisma);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
