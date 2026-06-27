import type { PrismaClient, AxisLean } from "@prisma/client";

// The 3-axis mastery model (docs/00-DESIGN.md §2, docs/04-ENGINES.md §1) — the
// spine. For each (topic, axis) we keep a score in [0,1], updated by an EWMA of
// difficulty-weighted outcomes whenever a problem is graded (solve or
// reflection). This is what makes the analytics, daily plan, contest difficulty,
// and readiness real instead of a rating proxy.

export type Axis = "OBSERVATION" | "TECHNIQUE" | "IMPLEMENTATION";
export const AXES: Axis[] = ["OBSERVATION", "TECHNIQUE", "IMPLEMENTATION"];

const ALPHA = 0.3; // EWMA learning rate
const DECAY_AFTER_DAYS = 14; // start drifting after this much inactivity
const DECAY_FACTOR = 0.97; // per-run multiplicative drift toward 0

// How strongly each axis is stressed when a problem has no explicit 0-5 tags —
// inferred from the topic's lean. Values are on the same 0-5 scale.
function leanWeights(lean: AxisLean | null | undefined): Record<Axis, number> {
  switch (lean) {
    case "OBSERVATION_HEAVY":
      return { OBSERVATION: 4, TECHNIQUE: 2, IMPLEMENTATION: 2 };
    case "TECHNIQUE_HEAVY":
      return { OBSERVATION: 2, TECHNIQUE: 4, IMPLEMENTATION: 2 };
    default:
      return { OBSERVATION: 3, TECHNIQUE: 3, IMPLEMENTATION: 3 };
  }
}

// A reflection's failReason points at the axis that actually failed.
const FAIL_TO_AXIS: Record<string, Axis | null> = {
  OBSERVATION: "OBSERVATION",
  TECHNIQUE: "TECHNIQUE",
  IMPLEMENTATION: "IMPLEMENTATION",
  DEBUG: "IMPLEMENTATION",
  TIME: null,
  CARELESS: null,
};

// Outcome (target value the EWMA pulls toward) from how the problem was solved.
function outcomeFor(solveState: "IN_CONTEST" | "UPSOLVED" | "UNSOLVED" | "SOLVED"): number {
  switch (solveState) {
    case "IN_CONTEST":
      return 1.0; // full credit — solved under pressure
    case "SOLVED":
      return 0.85; // path/practice solve
    case "UPSOLVED":
      return 0.6; // the paper values it, but less than in-contest
    case "UNSOLVED":
      return 0.0; // negative signal (applied only to the failing axis)
  }
}

type AxisWeights = Record<Axis, number>;

function problemAxisWeights(p: {
  obsDifficulty: number | null;
  techDifficulty: number | null;
  implDifficulty: number | null;
  topic: { lean: AxisLean } | null;
}): AxisWeights {
  const fallback = leanWeights(p.topic?.lean);
  return {
    OBSERVATION: p.obsDifficulty ?? fallback.OBSERVATION,
    TECHNIQUE: p.techDifficulty ?? fallback.TECHNIQUE,
    IMPLEMENTATION: p.implDifficulty ?? fallback.IMPLEMENTATION,
  };
}

async function applyOutcome(
  prisma: PrismaClient,
  userId: string,
  topicId: string,
  axis: Axis,
  outcome: number,
  difficulty: number, // 0-5, how much this problem stresses the axis
) {
  if (difficulty <= 0) return; // problem doesn't exercise this axis
  // Difficulty-weighted learning rate: a 5/5 axis moves mastery much more
  // than a 1/5 one (docs/04-ENGINES.md §1).
  const effAlpha = ALPHA * Math.min(1, Math.max(0.2, difficulty / 5));
  const existing = await prisma.masteryState.findUnique({
    where: { userId_topicId_axis: { userId, topicId, axis } },
  });
  const prev = existing?.score ?? 0;
  const next = prev + effAlpha * (outcome - prev);
  await prisma.masteryState.upsert({
    where: { userId_topicId_axis: { userId, topicId, axis } },
    update: { score: next, attempts: { increment: 1 }, lastSeen: new Date() },
    create: { userId, topicId, axis, score: next, attempts: 1, lastSeen: new Date() },
  });
}

// Grade a single problem outcome into the three axes. Solves credit every axis
// the problem stresses; an unsolved attempt only penalizes the failing axis (we
// don't know the others failed). Safe no-op for problems without a topic.
export async function recordProblemOutcome(
  prisma: PrismaClient,
  userId: string,
  problemId: string,
  solveState: "IN_CONTEST" | "UPSOLVED" | "UNSOLVED" | "SOLVED",
  failReason?: string | null,
) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    select: {
      topicId: true,
      obsDifficulty: true,
      techDifficulty: true,
      implDifficulty: true,
      topic: { select: { lean: true } },
    },
  });
  if (!problem?.topicId) return;
  const weights = problemAxisWeights(problem);
  const outcome = outcomeFor(solveState);

  if (solveState === "UNSOLVED") {
    const axis = failReason ? FAIL_TO_AXIS[failReason] : null;
    if (axis) await applyOutcome(prisma, userId, problem.topicId, axis, outcome, weights[axis]);
    return;
  }
  for (const axis of AXES) {
    await applyOutcome(prisma, userId, problem.topicId, axis, outcome, weights[axis]);
  }
}

// Nightly decay (docs/04-ENGINES.md §1): mastery drifts down when a topic hasn't
// been touched, which is what surfaces it for spaced review. Idempotent-ish —
// run once per cron tick.
export async function decayMastery(prisma: PrismaClient, userId: string) {
  const cutoff = new Date(Date.now() - DECAY_AFTER_DAYS * 86400_000);
  const stale = await prisma.masteryState.findMany({
    where: { userId, lastSeen: { lt: cutoff } },
    select: { id: true, score: true },
  });
  for (const s of stale) {
    await prisma.masteryState.update({
      where: { id: s.id },
      data: { score: s.score * DECAY_FACTOR },
    });
  }
  return stale.length;
}

export type TopicAxisMastery = {
  topicId: string;
  topicName: string;
  month: number;
  scores: Record<Axis, number>;
  attempts: Record<Axis, number>;
};

// Per-topic, per-axis mastery for the skill tree + weakness queries.
export async function getMasteryByTopic(
  prisma: PrismaClient,
  userId: string,
): Promise<TopicAxisMastery[]> {
  const states = await prisma.masteryState.findMany({
    where: { userId },
    include: { topic: { select: { id: true, name: true, month: true } } },
  });
  const byTopic = new Map<string, TopicAxisMastery>();
  for (const s of states) {
    let row = byTopic.get(s.topicId);
    if (!row) {
      row = {
        topicId: s.topicId,
        topicName: s.topic.name,
        month: s.topic.month,
        scores: { OBSERVATION: 0, TECHNIQUE: 0, IMPLEMENTATION: 0 },
        attempts: { OBSERVATION: 0, TECHNIQUE: 0, IMPLEMENTATION: 0 },
      };
      byTopic.set(s.topicId, row);
    }
    row.scores[s.axis as Axis] = s.score;
    row.attempts[s.axis as Axis] = s.attempts;
  }
  return [...byTopic.values()].sort((a, b) => a.month - b.month || a.topicName.localeCompare(b.topicName));
}

// Overall per-axis averages (across topics with any attempts) — the headline
// three numbers on the analytics page.
export async function getAxisAverages(
  prisma: PrismaClient,
  userId: string,
): Promise<{ axis: Axis; score: number; topics: number }[]> {
  const rows = await getMasteryByTopic(prisma, userId);
  return AXES.map((axis) => {
    const seen = rows.filter((r) => r.attempts[axis] > 0);
    const score = seen.length ? seen.reduce((s, r) => s + r.scores[axis], 0) / seen.length : 0;
    return { axis, score, topics: seen.length };
  });
}

// The single weakest (topic, axis) cell among topics the user has touched —
// drives the daily plan's "active weakness" slot.
export async function weakestCell(
  prisma: PrismaClient,
  userId: string,
): Promise<{ topicId: string; topicName: string; axis: Axis; score: number } | null> {
  const rows = await getMasteryByTopic(prisma, userId);
  let worst: { topicId: string; topicName: string; axis: Axis; score: number } | null = null;
  for (const r of rows) {
    for (const axis of AXES) {
      if (r.attempts[axis] === 0) continue;
      if (!worst || r.scores[axis] < worst.score) {
        worst = { topicId: r.topicId, topicName: r.topicName, axis, score: r.scores[axis] };
      }
    }
  }
  return worst;
}
