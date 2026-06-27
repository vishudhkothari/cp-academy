"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ContestKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { syncCodeforcesUser, syncAtcoderUser } from "@/lib/sources/sync";
import { generateContest, recomputeContestEntry } from "@/lib/engine/contest";
import { recordProblemOutcome } from "@/lib/engine/mastery";
import { ensureReviewCard, gradeReview, type ReviewGrade } from "@/lib/engine/review";
import { snapshotReadiness } from "@/lib/engine/readiness";
import { refreshDailyPlan } from "@/lib/engine/daily-plan";

// Apply engine side-effects for a freshly-solved problem (mastery + a review
// card). Idempotent for reviews; mastery should be called once per solve event.
async function onSolved(userId: string, problemId: string, solveState: "IN_CONTEST" | "UPSOLVED" | "SOLVED") {
  await recordProblemOutcome(prisma, userId, problemId, solveState);
  await ensureReviewCard(prisma, userId, problemId);
}

async function currentUser() {
  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No user");
  return user;
}

// Manual solve toggle. "Solved" = any AC submission exists. We can add/remove a
// MANUAL one; OJ-synced solves are authoritative and never deleted here.
export async function toggleSolved(problemId: string, solved: boolean) {
  const user = await currentUser();
  if (solved) {
    const existing = await prisma.submission.findFirst({
      where: { userId: user.id, problemId, verdict: "AC" },
      select: { id: true },
    });
    if (!existing) {
      await prisma.submission.create({
        data: {
          userId: user.id,
          problemId,
          language: "CPP",
          source: "",
          verdict: "AC",
          origin: "MANUAL",
        },
      });
      // First time solved → feed mastery and schedule a review.
      await onSolved(user.id, problemId, "SOLVED");
    }
  } else {
    await prisma.submission.deleteMany({
      where: { userId: user.id, problemId, origin: "MANUAL" },
    });
  }
  revalidatePath("/learn");
  revalidatePath("/problems");
  revalidatePath(`/problems/${problemId}`);
  revalidatePath("/");
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Problem-setting (paper SO-3): author your own problem. Stored as a MANUAL
// problem with a rendered statement; it then flows through the normal workspace.
export async function createAuthoredProblem(input: {
  title: string;
  statement: string;
  constraints: string;
  sampleInput: string;
  sampleOutput: string;
  topicSlug?: string;
  referenceSolution: string;
  language: "CPP" | "PYTHON";
}) {
  const user = await currentUser();
  const br = (s: string) => escHtml(s).replace(/\n/g, "<br/>");
  const html =
    `<p>${br(input.statement)}</p>` +
    (input.constraints
      ? `<div class="section-title">Constraints</div><p>${br(input.constraints)}</p>`
      : "") +
    (input.sampleInput || input.sampleOutput
      ? `<div class="sample-test"><div class="section-title">Example</div>` +
        `<div class="input"><div class="title">Input</div><pre>${escHtml(input.sampleInput)}</pre></div>` +
        `<div class="output"><div class="title">Output</div><pre>${escHtml(input.sampleOutput)}</pre></div></div>`
      : "");

  const topic = input.topicSlug
    ? await prisma.topic.findUnique({ where: { slug: input.topicSlug } })
    : null;

  const problem = await prisma.problem.create({
    data: {
      source: "MANUAL",
      externalId: `manual/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: input.title.trim() || "Untitled",
      url: "",
      statementHtml: html,
      topicId: topic?.id ?? null,
      notes: JSON.stringify({
        referenceSolution: input.referenceSolution,
        language: input.language,
        sampleInput: input.sampleInput,
        sampleOutput: input.sampleOutput,
        authoredBy: user.id,
      }),
    },
  });
  revalidatePath("/problems");
  redirect(`/problems/${problem.id}`);
}

export async function createTemplate(input: {
  title: string;
  language: "CPP" | "PYTHON";
  code: string;
  notes?: string;
}) {
  const user = await currentUser();
  await prisma.template.create({
    data: {
      userId: user.id,
      title: input.title.trim() || "Untitled",
      language: input.language,
      code: input.code,
      notes: input.notes?.trim() || null,
    },
  });
  revalidatePath("/reference");
}

export async function deleteTemplate(id: string) {
  const user = await currentUser();
  await prisma.template.deleteMany({ where: { id, userId: user.id } });
  revalidatePath("/reference");
}

export async function createContest(kind: ContestKind) {
  const user = await currentUser();
  const id = await generateContest(prisma, user.id, kind);
  revalidatePath("/contests");
  redirect(`/contests/${id}`);
}

// Kept for the existing weekly-contest form button.
export async function createWeeklyContest() {
  return createContest("WEEKLY");
}

// Shared post-sync engine refresh: credit mastery + schedule reviews for newly
// solved problems, recompute affected contest entries, then refresh readiness
// and today's plan.
async function applySyncedSolves(userId: string, problemIds: string[]) {
  for (const pid of problemIds) {
    await recordProblemOutcome(prisma, userId, pid, "SOLVED");
    await ensureReviewCard(prisma, userId, pid);
  }
  if (problemIds.length) {
    const cps = await prisma.contestProblem.findMany({
      where: { problemId: { in: problemIds } },
      select: { contestId: true },
    });
    for (const contestId of new Set(cps.map((c) => c.contestId))) {
      await recomputeContestEntry(prisma, userId, contestId);
    }
  }
  await snapshotReadiness(prisma, userId);
  await refreshDailyPlan(prisma, userId);
}

export async function resyncCodeforces() {
  const user = await currentUser();
  if (!user.cfHandle) return { error: "No Codeforces handle set" };
  const r = await syncCodeforcesUser(prisma, user.id, user.cfHandle);
  await applySyncedSolves(user.id, r.recordedProblemIds);
  revalidatePath("/learn");
  revalidatePath("/");
  revalidatePath("/analytics");
  return r;
}

export async function resyncAtcoder() {
  const user = await currentUser();
  if (!user.atcoderHandle) return { error: "No AtCoder handle set" };
  const r = await syncAtcoderUser(prisma, user.id, user.atcoderHandle);
  await applySyncedSolves(user.id, r.recordedProblemIds);
  revalidatePath("/learn");
  revalidatePath("/");
  revalidatePath("/analytics");
  return r;
}

export async function gradeReviewCard(cardId: string, grade: ReviewGrade) {
  const user = await currentUser();
  await gradeReview(prisma, user.id, cardId, grade);
  revalidatePath("/review");
  revalidatePath("/");
}

// Record the highest coaching-ladder level reached (1-6). Level 6 = full
// solution, which also counts as "solution seen".
export async function recordCoachLevel(problemId: string, level: number) {
  const user = await currentUser();
  const existing = await prisma.coachUsage.findUnique({
    where: { userId_problemId: { userId: user.id, problemId } },
  });
  const maxLevel = Math.max(existing?.maxLevel ?? 0, level);
  await prisma.coachUsage.upsert({
    where: { userId_problemId: { userId: user.id, problemId } },
    update: { maxLevel },
    create: { userId: user.id, problemId, maxLevel },
  });
  revalidatePath(`/problems/${problemId}`);
}

export async function setProblemAxes(
  problemId: string,
  axes: { obs?: number | null; tech?: number | null; impl?: number | null },
) {
  await prisma.problem.update({
    where: { id: problemId },
    data: {
      obsDifficulty: axes.obs ?? null,
      techDifficulty: axes.tech ?? null,
      implDifficulty: axes.impl ?? null,
    },
  });
  revalidatePath("/problems");
  revalidatePath(`/problems/${problemId}`);
}

export async function saveReflection(input: {
  problemId: string;
  solved: boolean;
  stuckLevel: number;
  failReason?:
    | "OBSERVATION"
    | "TECHNIQUE"
    | "IMPLEMENTATION"
    | "DEBUG"
    | "TIME"
    | "CARELESS"
    | null;
  bugType?:
    | "OVERFLOW"
    | "OFF_BY_ONE"
    | "TYPO"
    | "LOGIC"
    | "WRONG_OBSERVATION"
    | "COMPLEXITY"
    | "EDGE_CASE"
    | "OTHER"
    | null;
  note?: string;
  timeSpentMin?: number | null;
  // When reflecting on a contest problem we record which contest and whether the
  // solve happened inside the window — this is what makes upsolving first-class.
  contestId?: string | null;
  inContest?: boolean;
}) {
  const user = await currentUser();
  const solveState = input.solved
    ? input.inContest
      ? "IN_CONTEST"
      : "UPSOLVED"
    : "UNSOLVED";

  await prisma.reflection.create({
    data: {
      userId: user.id,
      problemId: input.problemId,
      contestId: input.contestId ?? null,
      solveState,
      stuckLevel: input.stuckLevel,
      failReason: input.failReason ?? null,
      bugType: input.bugType ?? null,
      note: input.note ?? "",
      timeSpentMin: input.timeSpentMin ?? null,
    },
  });

  // Feed the 3-axis mastery model from this graded outcome. We use the
  // reflection's specific solveState (IN_CONTEST/UPSOLVED/UNSOLVED) here, so we
  // must NOT also route through toggleSolved (which would re-credit as SOLVED).
  await recordProblemOutcome(prisma, user.id, input.problemId, solveState, input.failReason ?? null);

  if (input.solved) {
    // Log the AC (authoritative "solved") and schedule a review, without
    // re-applying mastery.
    const existing = await prisma.submission.findFirst({
      where: { userId: user.id, problemId: input.problemId, verdict: "AC" },
      select: { id: true },
    });
    if (!existing) {
      await prisma.submission.create({
        data: {
          userId: user.id,
          problemId: input.problemId,
          language: "CPP",
          source: "",
          verdict: "AC",
          origin: "MANUAL",
          inContest: Boolean(input.inContest),
          contestId: input.contestId ?? null,
        },
      });
    }
    await ensureReviewCard(prisma, user.id, input.problemId);
    revalidatePath("/learn");
    revalidatePath("/problems");
  }
  if (input.contestId) {
    await recomputeContestEntry(prisma, user.id, input.contestId);
    revalidatePath(`/contests/${input.contestId}`);
  }
  revalidatePath(`/problems/${input.problemId}`);
  revalidatePath("/review");
  revalidatePath("/");
}
