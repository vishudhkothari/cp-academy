import type { PrismaClient } from "@prisma/client";
import { getAxisAverages } from "./mastery";

// Readiness score (docs/04-ENGINES.md §8) — a composite, explainable estimate of
// "what real contest are you ready for", anchored to your REAL rating so it
// can't drift into fantasy the way an opponent-less Elo would. Replaces the
// synthetic Elo we deliberately rejected (docs/00-DESIGN.md §4).

export type Readiness = {
  score: number; // 0-100
  band: "Not yet" | "Div 4 / AtCoder ABC" | "Codeforces Div 3" | "Codeforces Div 2";
  bandRating: number; // the rating contests should target (adaptive difficulty)
  reasons: string[]; // one line per contributing factor
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export async function computeReadiness(
  prisma: PrismaClient,
  userId: string,
): Promise<Readiness> {
  const [axisAvgs, solvedRows, contestSolves, entries, latestCf] = await Promise.all([
    getAxisAverages(prisma, userId),
    prisma.submission.findMany({
      where: { userId, verdict: "AC" },
      distinct: ["problemId"],
      select: { problem: { select: { sourceRating: true } } },
    }),
    prisma.submission.count({ where: { userId, verdict: "AC", inContest: true } }),
    prisma.contestEntry.findMany({
      where: { userId },
      select: { solvedInContest: true, upsolved: true },
    }),
    prisma.ratingSnapshot.findFirst({
      where: { userId, kind: "CF_REAL" },
      orderBy: { takenAt: "desc" },
      select: { value: true },
    }),
  ]);

  const ratings = solvedRows.map((s) => s.problem.sourceRating ?? 0).filter((r) => r > 0);
  const maxSolved = ratings.length ? Math.max(...ratings) : 0;

  // 1) Breadth — average 3-axis mastery across touched topics.
  const breadth = axisAvgs.length ? axisAvgs.reduce((s, a) => s + a.score, 0) / axisAvgs.length : 0;

  // 2) Demonstrated difficulty — the real predictor: how hard a problem you've
  //    actually solved (capped at 2000 ≈ CM door).
  const difficulty = clamp01((maxSolved - 800) / (2000 - 800));

  // 3) Under-pressure solves — in-contest ACs (the experience the curriculum is after).
  const pressure = clamp01(contestSolves / 12);

  // 4) Learning velocity — upsolve-to-solve conversion (paper P3).
  const totalIn = entries.reduce((s, e) => s + e.solvedInContest, 0);
  const totalUp = entries.reduce((s, e) => s + e.upsolved, 0);
  const conversion = totalIn + totalUp > 0 ? totalUp / (totalIn + totalUp) : 0;

  const score = Math.round(
    100 * (0.3 * breadth + 0.4 * difficulty + 0.15 * pressure + 0.15 * conversion),
  );

  // Band — anchored to real rating where we have it, otherwise to demonstrated
  // difficulty. Conservative: needs a few solves at the band, not just one.
  const atLeast = (r: number) => ratings.filter((x) => x >= r).length;
  const anchor = Math.max(maxSolved, latestCf?.value ?? 0);
  let band: Readiness["band"] = "Not yet";
  if (ratings.length >= 1) {
    if (anchor >= 1500 && atLeast(1400) >= 5) band = "Codeforces Div 2";
    else if (anchor >= 1300 && atLeast(1200) >= 5) band = "Codeforces Div 3";
    else band = "Div 4 / AtCoder ABC";
  }

  // Adaptive contest difficulty: center problems near the top of what you can
  // already do, nudged by readiness. Falls back to a gentle 1000 before data.
  const base = maxSolved > 0 ? maxSolved : 1000;
  const bandRating = Math.min(2100, Math.max(900, Math.round((base + score * 4) / 100) * 100));

  const reasons: string[] = [];
  reasons.push(`3-axis breadth ${Math.round(breadth * 100)}% across ${axisAvgs.filter((a) => a.topics > 0).length} topics`);
  if (maxSolved) reasons.push(`hardest solve ${maxSolved}`);
  reasons.push(`${contestSolves} in-contest solves`);
  if (totalIn + totalUp > 0) reasons.push(`${Math.round(conversion * 100)}% upsolve conversion`);

  return { score, band, bandRating, reasons };
}

// Persist a READINESS snapshot for the trend line (RatingSnapshot.kind=READINESS).
// We store the 0-100 score. Skips writing if today's snapshot already exists.
export async function snapshotReadiness(prisma: PrismaClient, userId: string) {
  const r = await computeReadiness(prisma, userId);
  const since = new Date(Date.now() - 12 * 3600_000);
  const recent = await prisma.ratingSnapshot.findFirst({
    where: { userId, kind: "READINESS", takenAt: { gte: since } },
    select: { id: true },
  });
  if (recent) {
    await prisma.ratingSnapshot.update({ where: { id: recent.id }, data: { value: r.score } });
  } else {
    await prisma.ratingSnapshot.create({
      data: { userId, kind: "READINESS", value: r.score },
    });
  }
  return r;
}
