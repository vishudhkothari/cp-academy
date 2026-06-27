import type { PrismaClient, ContestKind } from "@prisma/client";
import { computeReadiness } from "./readiness";

// Contest generation (docs/04-ENGINES.md §4, paper §4.2 / P4). The weekly is the
// paper's core: three problems, each targeting a different axis — P1
// review/observation, P2 current-topic technique, P3 implementation-heavy. The
// other cadences (daily mini, monthly, quarterly mock-ICPC) reuse the same
// picker. Difficulty is ADAPTIVE: slots are centered on your readiness band, so
// contests stretch without crushing.

type Axis = "OBSERVATION" | "TECHNIQUE" | "IMPLEMENTATION";

type SlotSpec = {
  slot: number;
  axis: Axis;
  lean?: "OBSERVATION_HEAVY" | "TECHNIQUE_HEAVY";
  topicSlug?: string;
  min: number;
  max: number;
};

const DURATION: Record<ContestKind, number> = {
  DAILY: 45,
  WEEKLY: 90,
  MONTHLY: 180,
  QUARTERLY_MOCK: 300,
};

const TITLE: Record<ContestKind, string> = {
  DAILY: "Daily Mini",
  WEEKLY: "Weekly Contest",
  MONTHLY: "Monthly Contest",
  QUARTERLY_MOCK: "Quarterly Mock ICPC",
};

const clampBand = (r: number) => Math.min(2200, Math.max(800, r));

// Build the slot plan for a cadence, centered on the adaptive band `b`.
function slotsFor(kind: ContestKind, b: number): SlotSpec[] {
  const lo = (d: number) => clampBand(b + d);
  switch (kind) {
    case "DAILY":
      // Two quick problems just below the band — momentum, weakness-leaning.
      return [
        { slot: 0, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: lo(-250), max: lo(-50) },
        { slot: 1, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: lo(-200), max: lo(0) },
      ];
    case "WEEKLY":
      // Paper's canonical 3-slot structure.
      return [
        { slot: 0, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: lo(-300), max: lo(-50) },
        { slot: 1, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: lo(-100), max: lo(150) },
        { slot: 2, axis: "IMPLEMENTATION", topicSlug: "implementation", min: lo(-150), max: lo(100) },
      ];
    case "MONTHLY":
      // Five problems, ramping across the band.
      return [
        { slot: 0, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: lo(-350), max: lo(-150) },
        { slot: 1, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: lo(-200), max: lo(0) },
        { slot: 2, axis: "IMPLEMENTATION", topicSlug: "implementation", min: lo(-100), max: lo(100) },
        { slot: 3, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: lo(50), max: lo(250) },
        { slot: 4, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: lo(150), max: lo(350) },
      ];
    case "QUARTERLY_MOCK":
      // Mock-ICPC: wider spread, harder tail, longer window.
      return [
        { slot: 0, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: lo(-300), max: lo(-100) },
        { slot: 1, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: lo(-150), max: lo(50) },
        { slot: 2, axis: "IMPLEMENTATION", topicSlug: "implementation", min: lo(0), max: lo(200) },
        { slot: 3, axis: "TECHNIQUE", lean: "TECHNIQUE_HEAVY", min: lo(150), max: lo(350) },
        { slot: 4, axis: "OBSERVATION", lean: "OBSERVATION_HEAVY", min: lo(300), max: lo(550) },
      ];
  }
}

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
  opts: SlotSpec,
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
  let pool = candidates.filter((c) => !exclude.has(c.id));
  // Relax the lean/topic filter if the band is too sparse, keeping the rating band.
  if (!pool.length && (opts.lean || opts.topicSlug)) {
    const wide = await prisma.problem.findMany({
      where: {
        source: "CODEFORCES",
        sourceRating: { gte: opts.min, lte: opts.max },
      },
      orderBy: { solvedCount: "desc" },
      take: 200,
      select: { id: true },
    });
    pool = wide.filter((c) => !exclude.has(c.id));
  }
  if (!pool.length) return null;
  // Random from the top of the pool for variety without going obscure.
  return pool[Math.floor(Math.random() * Math.min(pool.length, 80))].id;
}

export async function generateContest(
  prisma: PrismaClient,
  userId: string,
  kind: ContestKind,
): Promise<string> {
  const readiness = await computeReadiness(prisma, userId);
  const specs = slotsFor(kind, readiness.bandRating);
  const exclude = await solvedIds(prisma, userId);

  const picks: { slot: number; targetAxis: Axis; problemId: string }[] = [];
  for (const s of specs) {
    const id = await pickProblem(prisma, s, exclude);
    if (id) {
      picks.push({ slot: s.slot, targetAxis: s.axis, problemId: id });
      exclude.add(id);
    }
  }
  // Need at least most of the slots; daily/weekly require a full set, larger
  // cadences tolerate one gap.
  const minNeeded = specs.length <= 3 ? specs.length : specs.length - 1;
  if (picks.length < minNeeded) {
    throw new Error("Not enough unsolved problems in range to build this contest.");
  }
  // Re-number slots densely so the UI labels stay A, B, C… without gaps.
  picks.forEach((p, i) => (p.slot = i));

  const contest = await prisma.contest.create({
    data: {
      kind,
      title: `${TITLE[kind]} · ${new Date().toLocaleDateString("en-GB")}`,
      durationMin: DURATION[kind],
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

// Back-compat wrapper.
export function generateWeeklyContest(prisma: PrismaClient, userId: string) {
  return generateContest(prisma, userId, "WEEKLY");
}

// Recompute a contest entry's solved/upsolved tallies from authoritative ACs —
// drives readiness's upsolve-conversion factor. Called after reflections/sync.
export async function recomputeContestEntry(
  prisma: PrismaClient,
  userId: string,
  contestId: string,
) {
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
    include: { problems: { select: { problemId: true } } },
  });
  if (!contest) return;
  const endsAt = contest.startsAt.getTime() + contest.durationMin * 60000;
  const pids = contest.problems.map((p) => p.problemId);
  const acs = await prisma.submission.findMany({
    where: { userId, verdict: "AC", problemId: { in: pids } },
    select: { problemId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const earliest = new Map<string, Date>();
  for (const a of acs) if (!earliest.has(a.problemId)) earliest.set(a.problemId, a.createdAt);
  let inContest = 0;
  let upsolved = 0;
  for (const [, when] of earliest) {
    if (when.getTime() <= endsAt) inContest++;
    else upsolved++;
  }
  await prisma.contestEntry.upsert({
    where: { userId_contestId: { userId, contestId } },
    update: { solvedInContest: inContest, upsolved },
    create: { userId, contestId, solvedInContest: inContest, upsolved },
  });
}
