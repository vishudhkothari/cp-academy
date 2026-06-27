import type { PrismaClient } from "@prisma/client";

// Rating ladder — our answer to TLE Eliminators' CP-31, made superior:
//   • CP-31: 31 handpicked problems per rating, 800→1900, Codeforces only,
//     static sheet.
//   • Ours: the most-solved (i.e. canonical, widely-recommended) problems per
//     rating across BOTH Codeforces and AtCoder, 800→2100 (past CM's door),
//     that tracks your solves and feeds the same mastery/readiness engine.
//
// "Most solved at a rating" is a strong quality proxy: the famous, well-known
// problems at each level are exactly the ones hand-curated sheets converge on.

export type LadderProblem = {
  id: string;
  title: string;
  url: string;
  source: string;
  rating: number | null;
  solved: boolean;
};

export type LadderRung = {
  rating: number;
  total: number;
  solved: number;
  problems: LadderProblem[];
};

export async function getRatingLadder(
  prisma: PrismaClient,
  userId: string | null,
  opts: { perRating?: number; min?: number; max?: number } = {},
): Promise<LadderRung[]> {
  const perRating = opts.perRating ?? 25;
  const min = opts.min ?? 800;
  const max = opts.max ?? 2100;

  const solvedSet = userId
    ? new Set(
        (
          await prisma.submission.findMany({
            where: { userId, verdict: "AC" },
            distinct: ["problemId"],
            select: { problemId: true },
          })
        ).map((s) => s.problemId),
      )
    : new Set<string>();

  const rungs: LadderRung[] = [];
  for (let rating = min; rating <= max; rating += 100) {
    // Bucket by [rating, rating+100): exact for CF (multiples of 100), inclusive
    // for AtCoder's arbitrary difficulties.
    const probs = await prisma.problem.findMany({
      where: {
        source: { in: ["CODEFORCES", "ATCODER"] },
        sourceRating: { gte: rating, lt: rating + 100 },
      },
      orderBy: { solvedCount: "desc" },
      take: perRating,
      select: { id: true, title: true, url: true, source: true, sourceRating: true },
    });
    const problems: LadderProblem[] = probs.map((p) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      source: p.source,
      rating: p.sourceRating,
      solved: solvedSet.has(p.id),
    }));
    rungs.push({
      rating,
      total: problems.length,
      solved: problems.filter((p) => p.solved).length,
      problems,
    });
  }
  return rungs;
}
