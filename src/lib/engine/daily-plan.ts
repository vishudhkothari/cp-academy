import type { PrismaClient } from "@prisma/client";
import { countDueReviews } from "./review";
import { weakestCell, type Axis } from "./mastery";
import { computeReadiness } from "./readiness";
import { computePace, paceStatus } from "./pace";
import { weeklySchedule } from "./schedule";

// How many path problems to surface as concrete cards in a single day's plan,
// even if the quota is higher (keeps the list readable; the rest stay on /learn).
const MAX_PATH_CARDS = 6;

// The "tell me what to do today" engine (docs/04-ENGINES.md §3). A transparent
// priority cascade — every item carries a one-line `reason`. Output is persisted
// as a DailyPlan (one per user per day) and surfaced on the dashboard; the cron
// rebuilds it each morning.

export type PlanItem = {
  type: "PACE" | "REVIEW" | "WEAKNESS" | "PROBLEM" | "CONTEST" | "UPSOLVE";
  title: string;
  reason: string;
  href: string;
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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

  // 0) Pace header — the finish-in-one-year target. Sets today's quota and shows
  //    whether you're on track to clear the whole curriculum within the year.
  const pace = await computePace(prisma, userId);
  if (pace.total > 0 && !pace.finished) {
    const st = paceStatus(pace);
    const goal =
      pace.todayRemaining > 0
        ? `Solve ${pace.todayRemaining} path problem${pace.todayRemaining > 1 ? "s" : ""} today`
        : `Today's ${pace.perDayNeeded} done — keep momentum`;
    items.push({
      type: "PACE",
      title: goal,
      reason: `${pace.done}/${pace.total} done (${Math.round(pace.pct * 100)}%) · ${st.label} · finish-by-${fmtDate(pace.targetDate)} needs ${pace.perDayNeeded}/day.`,
      href: "/learn",
    });
  }

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

  // 3) Curriculum progression — serve TODAY'S QUOTA of unsolved path problems in
  //    order (not just the next one), so clearing the plan = staying on the
  //    one-year track. Capped for readability; the rest live on /learn.
  const curated = await prisma.curatedProblem.findMany({
    orderBy: [{ topic: { month: "asc" } }, { topic: { name: "asc" } }, { order: "asc" }],
    select: {
      problemId: true,
      problem: { select: { id: true, title: true } },
      topic: { select: { name: true, month: true } },
    },
  });
  const quota = Math.min(Math.max(pace.todayRemaining, pace.finished ? 0 : 1), MAX_PATH_CARDS);
  let served = 0;
  for (const c of curated) {
    if (served >= quota) break;
    if (solved.has(c.problemId)) continue;
    served++;
    items.push({
      type: "PROBLEM",
      title: c.problem.title,
      reason: `Path ${served}/${quota} today · Month ${c.topic.month} · ${c.topic.name}.`,
      href: `/problems/${c.problem.id}`,
    });
  }

  // 4) Weekly contest — a fixed appointment. Nudge only when the slot is OPEN and
  //    this week's hasn't been run yet (discipline: it happens at its time).
  const slotUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { weeklyDay: true, weeklyHour: true },
  });
  if (slotUser && readiness.band !== "Not yet") {
    const sch = weeklySchedule(slotUser.weeklyDay, slotUser.weeklyHour);
    const doneThisWeek = await prisma.contest.findFirst({
      where: { kind: "WEEKLY", startsAt: { gte: sch.thisSlot } },
      select: { id: true },
    });
    if (sch.isOpen && !doneThisWeek) {
      items.push({
        type: "CONTEST",
        title: "Weekly contest is open — start now",
        reason: `Your ${sch.label} slot is live · 90 min, 3 problems, upsolve the rest.`,
        href: "/contests",
      });
    }
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
