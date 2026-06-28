import type { PrismaClient } from "@prisma/client";

// Pacing engine — turns the curated curriculum into a finish-on-time target.
// Two modes:
//  • LITE (exam season): a fixed, gentle 1 problem per solving-day (Mon–Sat;
//    Sunday is contest-only). The finish date is DERIVED from that rate.
//  • FULL (post-exam ramp-up): a self-correcting quota to clear the whole
//    curriculum within TARGET_DAYS.
// The platform can't guarantee a Codeforces rating (earned in live contests) —
// it guarantees the controllable input: hit the daily cadence and you finish.

export const TARGET_DAYS = 365;
const MS_DAY = 86_400_000;
const IST = 330 * 60_000; // schedule/day-of-week reasoning is done in IST
const SUSTAINABLE_PER_DAY = 6;
const REST_DOW = 0; // Sunday — contest day, no daily problem (LITE)

export type PathMode = "LITE" | "FULL";

export type Pace = {
  mode: PathMode;
  total: number;
  done: number;
  remaining: number;
  startDate: Date;
  targetDate: Date; // scheduled finish
  daysElapsed: number;
  daysLeft: number;
  perDayNeeded: number;
  dailyTarget: number; // intended cadence (LITE = 1)
  doneToday: number;
  todayRemaining: number;
  isRestDay: boolean; // LITE: today is the contest day
  expectedDone: number;
  aheadBy: number; // done - expectedDone (negative = behind)
  onPace: boolean;
  atRisk: boolean;
  finished: boolean;
  projectedFinish: Date | null;
  pct: number;
};

function midnight(d = new Date()): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m;
}

// Integer day index and weekday in IST (no DST in India → fixed +5:30).
function istDayIdx(ms: number): number {
  return Math.floor((ms + IST) / MS_DAY);
}
function dowOf(idx: number): number {
  // epoch day 0 (1970-01-01) was a Thursday (4).
  return (((idx % 7) + 4) % 7 + 7) % 7;
}
function dateOfIdx(idx: number): Date {
  return new Date(idx * MS_DAY - IST + 12 * 3_600_000); // ~noon IST that day
}
function countSolving(a: number, b: number): number {
  let c = 0;
  for (let i = a; i <= b; i++) if (dowOf(i) !== REST_DOW) c++;
  return c;
}
function addSolving(a: number, n: number): number {
  if (n <= 0) return a;
  let i = a;
  let c = 0;
  for (;;) {
    if (dowOf(i) !== REST_DOW) {
      c++;
      if (c === n) return i;
    }
    i++;
    if (i - a > 6000) return i; // safety
  }
}

export async function computePace(prisma: PrismaClient, userId: string): Promise<Pace> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pathStartDate: true, pathMode: true },
  });
  const mode: PathMode = user?.pathMode === "FULL" ? "FULL" : "LITE";

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
  const mid = midnight();
  const doneToday = solvedRows.filter((r) => r.createdAt >= mid).length;
  const finished = remaining === 0 && total > 0;
  const now = Date.now();
  const pct = total > 0 ? done / total : 0;

  if (mode === "LITE") {
    // Fixed 1 problem per solving-day (Mon–Sat).
    const startIdx = istDayIdx(startDate.getTime());
    const todayIdx = istDayIdx(now);
    const isRestDay = dowOf(todayIdx) === REST_DOW;
    const expectedDone = Math.min(total, countSolving(startIdx, todayIdx - 1)); // through yesterday
    const aheadBy = done - expectedDone;
    const todayRemaining = isRestDay || remaining === 0 ? 0 : doneToday >= 1 ? 0 : 1;
    const finishIdx = addSolving(startIdx, total); // scheduled finish day at 1/day
    const targetDate = dateOfIdx(finishIdx);
    const firstAvail = isRestDay || doneToday >= 1 ? todayIdx + 1 : todayIdx;
    const projectedFinish = remaining > 0 ? dateOfIdx(addSolving(firstAvail, remaining)) : new Date(now);
    return {
      mode,
      total,
      done,
      remaining,
      startDate,
      targetDate,
      daysElapsed: Math.max(0, todayIdx - startIdx),
      daysLeft: Math.max(0, finishIdx - todayIdx),
      perDayNeeded: 1,
      dailyTarget: 1,
      doneToday,
      todayRemaining,
      isRestDay,
      expectedDone,
      aheadBy,
      onPace: done >= expectedDone,
      atRisk: aheadBy < -14, // more than two weeks behind
      finished,
      projectedFinish,
      pct,
    };
  }

  // FULL — self-correcting quota to finish within TARGET_DAYS.
  const targetDate = new Date(startDate.getTime() + TARGET_DAYS * MS_DAY);
  const daysElapsed = Math.max(0, Math.floor((now - startDate.getTime()) / MS_DAY));
  const daysLeft = Math.max(1, Math.ceil((targetDate.getTime() - now) / MS_DAY));
  const perDayNeeded = remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;
  const todayRemaining = Math.max(0, perDayNeeded - doneToday);
  const expectedDone = Math.min(total, Math.round(total * Math.min(1, daysElapsed / TARGET_DAYS)));
  const aheadBy = done - expectedDone;
  const perDaySoFar = daysElapsed > 0 ? done / daysElapsed : 0;
  const projectedFinish =
    remaining === 0
      ? new Date(now)
      : perDaySoFar > 0
        ? new Date(now + (remaining / perDaySoFar) * MS_DAY)
        : null;
  return {
    mode,
    total,
    done,
    remaining,
    startDate,
    targetDate,
    daysElapsed,
    daysLeft,
    perDayNeeded,
    dailyTarget: perDayNeeded,
    doneToday,
    todayRemaining,
    isRestDay: false,
    expectedDone,
    aheadBy,
    onPace: done >= expectedDone,
    atRisk: perDayNeeded > SUSTAINABLE_PER_DAY,
    finished,
    projectedFinish,
    pct,
  };
}

export function paceStatus(p: Pace): { label: string; tone: "ready" | "warn" | "behind" } {
  if (p.finished) return { label: "Curriculum complete", tone: "ready" };
  if (p.atRisk)
    return {
      label: p.mode === "LITE" ? `Behind by ${-p.aheadBy}` : `Behind — needs ${p.perDayNeeded}/day`,
      tone: "behind",
    };
  if (p.onPace) return { label: p.aheadBy > 0 ? `Ahead by ${p.aheadBy}` : "On pace", tone: "ready" };
  return { label: `Behind by ${-p.aheadBy}`, tone: "warn" };
}
