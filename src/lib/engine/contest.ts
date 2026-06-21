import type { PrismaClient } from "@prisma/client";

// Contest generation (paper §4.2 / P4): three problems, each targeting a
// different axis — P1 review/observation, P2 current-topic technique, P3
// implementation-heavy. Difficulty is a gentle beginner band for now; it will
// move with readiness once mastery data accrues.

type Axis = "OBSERVATION" | "TECHNIQUE" | "IMPLEMENTATION";

const SLOTS: {
  slot: number;
  axis: Axis;
  lean?: "OBSERVATION_HEAVY" | "TECHNIQUE_HEAVY";
  topicSlug?: string;
  min: number;
  max: number;
}[] = [
  { slot: 0, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: 800, max: 1100 },
  { slot: 1, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: 1000, max: 1300 },
  { slot: 2, axis: "IMPLEMENTATION", topicSlug: "implementation", min: 900, max: 1200 },
];

async function solvedIds(prisma: PrismaClient, userId: string): Promise<Set<string>> {
  const rows = await prisma.submission.findMany({
    where: { userId, verdict: "AC" },
    distinct: ["problemId"],
    select: { problemId: true },
  });
  return new Set(rows.map((r) => r.problemId));
}

async function pickProblem(
  prisma: PrismaClient,
  opts: (typeof SLOTS)[number],
  exclude: Set<string>,
): Promise<string | null> {
  const candidates = await prisma.problem.findMany({
    where: {
      source: "CODEFORCES",
      sourceRating: { gte: opts.min, lte: opts.max },
      ...(opts.lean ? { topic: { lean: opts.lean } } : {}),
      ...(opts.topicSlug ? { topic: { slug: opts.topicSlug } } : {}),
    },
    orderBy: { solvedCount: "desc" }, // prefer canonical, well-known problems
    take: 200,
    select: { id: true },
  });
  const pool = candidates.filter((c) => !exclude.has(c.id));
  if (!pool.length) return null;
  // random from the top of the pool for variety without going obscure
  return pool[Math.floor(Math.random() * Math.min(pool.length, 80))].id;
}

export async function generateWeeklyContest(
  prisma: PrismaClient,
  userId: string,
): Promise<string> {
  const exclude = await solvedIds(prisma, userId);
  const picks: { slot: number; targetAxis: Axis; problemId: string }[] = [];
  for (const s of SLOTS) {
    const id = await pickProblem(prisma, s, exclude);
    if (id) {
      picks.push({ slot: s.slot, targetAxis: s.axis, problemId: id });
      exclude.add(id);
    }
  }
  if (picks.length < 3) {
    throw new Error("Not enough unsolved problems in range to build a contest.");
  }

  const contest = await prisma.contest.create({
    data: {
      kind: "WEEKLY",
      title: `Weekly Contest · ${new Date().toLocaleDateString("en-GB")}`,
      durationMin: 90,
      startsAt: new Date(),
      status: "LIVE",
      problems: {
        create: picks.map((p) => ({
          slot: p.slot,
          targetAxis: p.targetAxis,
          problemId: p.problemId,
        })),
      },
    },
  });
  return contest.id;
}
