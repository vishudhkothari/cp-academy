import type { PrismaClient } from "@prisma/client";

// Pacing engine — turns the curated curriculum into a finish-in-one-year target.
// The platform can't *guarantee* a Codeforces rating (that's earned in live
// contests), but it CAN guarantee the controllable input: if you clear the daily
// quota, you finish all ~741 curated problems within TARGET_DAYS by construction.
// The quota self-corrects — `ceil(remaining / daysLeft)` rises if you fall behind
// and falls if you get ahead, so the finish date stays fixed.

export const TARGET_DAYS = 365;
const MS_DAY = 86_400_000;
// Above this, a daily quota is no longer realistically sustainable → flag "at risk"
// instead of pretending the plan is still on track.
const SUSTAINABLE_PER_DAY = 6;

export type Pace = {
  total: number; // curated path size
  done: number; // curated problems solved
  remaining: number;
  startDate: Date;
  targetDate: Date;
  daysElapsed: number;
  daysLeft: number; // always >= 1
  perDayNeeded: number; // quota to still finish by targetDate
  doneToday: number; // curated solved since local midnight
  todayRemaining: number; // quota left for today
  expectedDone: number; // where a steady pace would have you by now
  aheadBy: number; // done - expectedDone (negative = behind)
  onPace: boolean;
  atRisk: boolean; // quota has grown beyond what's sustainable
  finished: boolean;
  projectedFinish: Date | null; // at your actual velocity so far
  pct: number; // 0..1
};

function midnight(d = new Date()): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m;
}

export async function computePace(prisma: PrismaClient, userId: string): Promise<Pace> {
  // Anchor the clock. Lazy-set to today on first call so "one year" starts when
  // the user actually begins, not at account creation.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pathStartDate: true },
  });
  let startDate = user?.pathStartDate ?? null;
  if (!startDate) {
    startDate = midnight();
    await prisma.user.update({ where: { id: userId }, data: { pathStartDate: startDate } });
  }

  const curated = await prisma.curatedProblem.findMany({ select: { problemId: true } });
  const total = curated.length;
  const ids = curated.map((c) => c.problemId);

  const solvedRows = ids.length
    ? await prisma.submission.findMany({
        where: { userId, verdict: "AC", problemId: { in: ids } },
        distinct: ["problemId"],
        select: { problemId: true, createdAt: true },
      })
    : [];
  const done = solvedRows.length;
  const remaining = Math.max(0, total - done);

  const targetDate = new Date(startDate.getTime() + TARGET_DAYS * MS_DAY);
  const now = Date.now();
  const daysElapsed = Math.max(0, Math.floor((now - startDate.getTime()) / MS_DAY));
  const daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - now) / MS_DAY));

  const perDayNeeded = remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;

  const mid = midnight();
  const doneToday = solvedRows.filter((r) => r.createdAt >= mid).length;
  const todayRemaining = Math.max(0, perDayNeeded - doneToday);

  const expectedDone = Math.min(total, Math.round(total * Math.min(1, daysElapsed / TARGET_DAYS)));
  const aheadBy = done - expectedDone;
  const onPace = done >= expectedDone;
  const atRisk = perDayNeeded > SUSTAINABLE_PER_DAY;
  const finished = remaining === 0 && total > 0;

  const perDaySoFar = daysElapsed > 0 ? done / daysElapsed : 0;
  const projectedFinish =
    remaining === 0
      ? new Date(now)
      : perDaySoFar > 0
        ? new Date(now + (remaining / perDaySoFar) * MS_DAY)
        : null;

  return {
    total,
    done,
    remaining,
    startDate,
    targetDate,
    daysElapsed,
    daysLeft,
    perDayNeeded,
    doneToday,
    todayRemaining,
    expectedDone,
    aheadBy,
    onPace,
    atRisk,
    finished,
    projectedFinish,
    pct: total > 0 ? done / total : 0,
  };
}

// One-line status for banners / plan reasons.
export function paceStatus(p: Pace): { label: string; tone: "ready" | "warn" | "behind" } {
  if (p.finished) return { label: "Curriculum complete", tone: "ready" };
  if (p.atRisk) return { label: `Behind — needs ${p.perDayNeeded}/day`, tone: "behind" };
  if (p.onPace) return { label: p.aheadBy > 0 ? `Ahead by ${p.aheadBy}` : "On pace", tone: "ready" };
  return { label: `Behind by ${-p.aheadBy}`, tone: "warn" };
}
