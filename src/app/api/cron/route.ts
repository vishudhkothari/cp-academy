import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncCodeforcesUser, syncAtcoderUser, rebuildCatalogAndPath } from "@/lib/sources/sync";
import { recordProblemOutcome, decayMastery } from "@/lib/engine/mastery";
import { ensureReviewCard } from "@/lib/engine/review";
import { recomputeContestEntry } from "@/lib/engine/contest";
import { snapshotReadiness } from "@/lib/engine/readiness";
import { refreshDailyPlan } from "@/lib/engine/daily-plan";

// Nightly maintenance (docs/04-ENGINES.md §1/§3, docs/05-ROADMAP.md Phase 5):
// re-sync real solves, decay stale mastery, snapshot readiness, rebuild today's
// plan. Wired to Vercel Cron (see vercel.json). Protected by CRON_SECRET: Vercel
// sends `Authorization: Bearer <CRON_SECRET>`; we also allow `?secret=`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (e.g. local) → open
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summary: Record<string, unknown>[] = [];

  // Refresh the catalog + curated path when it's gone stale (>3 days), so quality
  // scores and ladders self-heal without a manual rebuild. Heavy, hence guarded.
  const lastSync = await prisma.problem.findFirst({
    where: { source: "CODEFORCES" },
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });
  const stale = !lastSync?.syncedAt || lastSync.syncedAt < new Date(Date.now() - 3 * 86400_000);
  if (stale) {
    try {
      const r = await rebuildCatalogAndPath(prisma);
      summary.push({ rebuild: { curated: r.curated.curated, cfCreated: r.cf.created, atCreated: r.at.created } });
    } catch (e) {
      summary.push({ rebuildError: (e as Error).message });
    }
  }

  const users = await prisma.user.findMany({
    select: { id: true, cfHandle: true, atcoderHandle: true },
  });
  for (const user of users) {
    const recorded: string[] = [];
    let cfSnapshots = 0;

    if (user.cfHandle) {
      try {
        const r = await syncCodeforcesUser(prisma, user.id, user.cfHandle);
        recorded.push(...r.recordedProblemIds);
        cfSnapshots = r.snapshots;
      } catch (e) {
        summary.push({ user: user.id, cfError: (e as Error).message });
      }
    }
    if (user.atcoderHandle) {
      try {
        const r = await syncAtcoderUser(prisma, user.id, user.atcoderHandle);
        recorded.push(...r.recordedProblemIds);
      } catch (e) {
        summary.push({ user: user.id, atcoderError: (e as Error).message });
      }
    }

    for (const pid of recorded) {
      await recordProblemOutcome(prisma, user.id, pid, "SOLVED");
      await ensureReviewCard(prisma, user.id, pid);
    }
    if (recorded.length) {
      const cps = await prisma.contestProblem.findMany({
        where: { problemId: { in: recorded } },
        select: { contestId: true },
      });
      for (const contestId of new Set(cps.map((c) => c.contestId))) {
        await recomputeContestEntry(prisma, user.id, contestId);
      }
    }

    const decayed = await decayMastery(prisma, user.id);
    const readiness = await snapshotReadiness(prisma, user.id);
    const plan = await refreshDailyPlan(prisma, user.id);

    summary.push({
      user: user.id,
      newSolves: recorded.length,
      cfSnapshots,
      decayed,
      readiness: readiness.score,
      planItems: plan.length,
    });
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), users: summary });
}
