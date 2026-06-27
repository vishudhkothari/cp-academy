import type { PrismaClient } from "@prisma/client";
import { countDueReviews } from "./review";
import { weakestCell, type Axis } from "./mastery";
import { computeReadiness } from "./readiness";

// The "tell me what to do today" engine (docs/04-ENGINES.md §3). A transparent
// priority cascade — every item carries a one-line `reason`. Output is persisted
// as a DailyPlan (one per user per day) and surfaced on the dashboard; the cron
// rebuilds it each morning.

export type PlanItem = {
  type: "REVIEW" | "WEAKNESS" | "PROBLEM" | "CONTEST" | "UPSOLVE";
  title: string;
  reason: string;
  href: string;
};

const AXIS_LABEL: Record<Axis, string> = {
  OBSERVATION: "observation",
  TECHNIQUE: "technique",
  IMPLEMENTATION: "implementation",
};

function midnight(d = new Date()): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m;
}

async function solvedSet(prisma: PrismaClient, userId: string): Promise<Set<string>> {
  const rows = await prisma.submission.findMany({
    where: { userId, verdict: "AC" },
    distinct: ["problemId"],
    select: { problemId: true },
  });
  return new Set(rows.map((r) => r.problemId));
}

export async function buildDailyPlan(
  prisma: PrismaClient,
  userId: string,
): Promise<PlanItem[]> {
  const items: PlanItem[] = [];
  const solved = await solvedSet(prisma, userId);

  // 1) Due reviews first — retention beats new volume (paper P12).
  const due = await countDueReviews(prisma, userId);
  if (due > 0) {
    items.push({
      type: "REVIEW",
      title: `${due} review${due > 1 ? "s" : ""} due`,
      reason: "Re-derive the key idea before it fades — retention is the point.",
      href: "/review",
    });
  }

  // 2) Active weakness — the lowest (topic, axis) cell you've actually touched.
  const readiness = await computeReadiness(prisma, userId);
  const weak = await weakestCell(prisma, userId);
  if (weak && weak.score < 0.6) {
    const band = readiness.bandRating;
    const candidate = await prisma.problem.findFirst({
      where: {
        topicId: weak.topicId,
        source: "CODEFORCES",
        sourceRating: { gte: band - 200, lte: band + 100 },
        id: { notIn: [...solved] },
      },
      orderBy: { solvedCount: "desc" },
      select: { id: true, title: true },
    });
    if (candidate) {
      items.push({
        type: "WEAKNESS",
        title: candidate.title,
        reason: `Your ${AXIS_LABEL[weak.axis]} on ${weak.topicName} is weak (${Math.round(
          weak.score * 100,
        )}%) — train it directly.`,
        href: `/problems/${candidate.id}`,
      });
    }
  }

  // 3) Curriculum progression — the next unsolved problem on the curated path.
  const curated = await prisma.curatedProblem.findMany({
    orderBy: [{ topic: { month: "asc" } }, { topic: { name: "asc" } }, { order: "asc" }],
    select: {
      problemId: true,
      problem: { select: { id: true, title: true } },
      topic: { select: { name: true, month: true } },
    },
  });
  const nextPath = curated.find((c) => !solved.has(c.problemId));
  if (nextPath) {
    items.push({
      type: "PROBLEM",
      title: nextPath.problem.title,
      reason: `Next on your path · Month ${nextPath.topic.month} · ${nextPath.topic.name}.`,
      href: `/problems/${nextPath.problem.id}`,
    });
  }

  // 4) Contest cadence — nudge a weekly if it's been ~7 days.
  const lastWeekly = await prisma.contest.findFirst({
    where: { kind: "WEEKLY" },
    orderBy: { startsAt: "desc" },
    select: { startsAt: true },
  });
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  if (readiness.band !== "Not yet" && (!lastWeekly || lastWeekly.startsAt < weekAgo)) {
    items.push({
      type: "CONTEST",
      title: "Run a weekly contest",
      reason: "Time pressure is the differentiator — 90 min, 3 problems, upsolve the rest.",
      href: "/contests",
    });
  }

  // 5) Upsolve backlog — unsolved contest problems, oldest first (paper P3).
  const contestProblems = await prisma.contestProblem.findMany({
    include: {
      contest: { select: { startsAt: true, durationMin: true } },
      problem: { select: { id: true, title: true } },
    },
    orderBy: { contest: { startsAt: "asc" } },
  });
  for (const cp of contestProblems) {
    if (solved.has(cp.problemId)) continue;
    const endsAt = cp.contest.startsAt.getTime() + cp.contest.durationMin * 60000;
    if (Date.now() <= endsAt) continue; // contest still live
    const ageDays = Math.floor((Date.now() - endsAt) / 86400_000);
    items.push({
      type: "UPSOLVE",
      title: cp.problem.title,
      reason: `Unsolved from a contest ${ageDays}d ago — the upsolve is where the learning is.`,
      href: `/problems/${cp.problem.id}`,
    });
    break; // one nudge at a time
  }

  return items;
}

// Build and persist today's plan (idempotent per day).
export async function refreshDailyPlan(prisma: PrismaClient, userId: string) {
  const items = await buildDailyPlan(prisma, userId);
  const date = midnight();
  await prisma.dailyPlan.upsert({
    where: { userId_date: { userId, date } },
    update: { items },
    create: { userId, date, items },
  });
  return items;
}

// Read today's plan, building it on the fly if the cron hasn't run yet.
export async function getTodayPlan(prisma: PrismaClient, userId: string): Promise<PlanItem[]> {
  const date = midnight();
  const existing = await prisma.dailyPlan.findUnique({
    where: { userId_date: { userId, date } },
    select: { items: true },
  });
  if (existing) return existing.items as unknown as PlanItem[];
  return refreshDailyPlan(prisma, userId);
}
