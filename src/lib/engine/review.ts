import type { PrismaClient } from "@prisma/client";

// Spaced repetition over solved PATTERNS (docs/04-ENGINES.md §2, paper P12).
// SM-2, ~50 lines, fully inspectable. We don't re-solve from scratch on review —
// we re-derive the key observation ("what was the trick?") and self-grade. The
// ReviewCard's `stability` holds the current interval in days; `difficulty`
// holds the SM-2 ease factor.

export type ReviewGrade = "forgot" | "hard" | "good" | "easy";

// SM-2 quality (0-5). We expose four buttons mapped onto the meaningful range.
const GRADE_Q: Record<ReviewGrade, number> = { forgot: 1, hard: 3, good: 4, easy: 5 };

const FIRST_INTERVAL_DAYS = 3; // first review after a fresh solve
const MIN_EASE = 1.3;
const START_EASE = 2.5;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + Math.round(days) * 86400_000);
}

// Create a review card when a problem is first solved (idempotent). Existing
// cards are left untouched so re-syncing solves doesn't reset progress.
export async function ensureReviewCard(
  prisma: PrismaClient,
  userId: string,
  problemId: string,
) {
  const existing = await prisma.reviewCard.findUnique({
    where: { userId_problemId: { userId, problemId } },
    select: { id: true },
  });
  if (existing) return;
  await prisma.reviewCard.create({
    data: {
      userId,
      problemId,
      due: addDays(new Date(), FIRST_INTERVAL_DAYS),
      stability: FIRST_INTERVAL_DAYS,
      difficulty: START_EASE,
      reps: 0,
      lapses: 0,
    },
  });
}

// Apply a self-grade and reschedule (SM-2).
export async function gradeReview(
  prisma: PrismaClient,
  userId: string,
  cardId: string,
  grade: ReviewGrade,
) {
  const card = await prisma.reviewCard.findFirst({
    where: { id: cardId, userId },
  });
  if (!card) return;

  const q = GRADE_Q[grade];
  let ease = card.difficulty;
  let interval = card.stability;
  let reps = card.reps;
  let lapses = card.lapses;

  if (q < 3) {
    // Forgot — relearn from the short end.
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = interval * ease;
    reps += 1;
  }
  // SM-2 ease update, clamped.
  ease = Math.max(MIN_EASE, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  await prisma.reviewCard.update({
    where: { id: card.id },
    data: {
      difficulty: ease,
      stability: interval,
      reps,
      lapses,
      due: addDays(new Date(), interval),
    },
  });
}

export type DueReview = {
  cardId: string;
  problemId: string;
  title: string;
  url: string;
  topic: string | null;
  reps: number;
  overdueDays: number;
};

export async function getDueReviews(
  prisma: PrismaClient,
  userId: string,
  limit = 20,
): Promise<DueReview[]> {
  const cards = await prisma.reviewCard.findMany({
    where: { userId, due: { lte: new Date() } },
    orderBy: { due: "asc" },
    take: limit,
    include: {
      problem: { select: { id: true, title: true, url: true, topic: { select: { name: true } } } },
    },
  });
  const now = Date.now();
  return cards.map((c) => ({
    cardId: c.id,
    problemId: c.problemId,
    title: c.problem.title,
    url: c.problem.url,
    topic: c.problem.topic?.name ?? null,
    reps: c.reps,
    overdueDays: Math.max(0, Math.floor((now - c.due.getTime()) / 86400_000)),
  }));
}

export async function countDueReviews(prisma: PrismaClient, userId: string): Promise<number> {
  return prisma.reviewCard.count({ where: { userId, due: { lte: new Date() } } });
}
