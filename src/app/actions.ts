"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { syncCodeforcesUser } from "@/lib/sources/sync";
import { generateWeeklyContest } from "@/lib/engine/contest";

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

export async function createWeeklyContest() {
  const user = await currentUser();
  const id = await generateWeeklyContest(prisma, user.id);
  revalidatePath("/contests");
  redirect(`/contests/${id}`);
}

export async function resyncCodeforces() {
  const user = await currentUser();
  if (!user.cfHandle) return { error: "No Codeforces handle set" };
  const r = await syncCodeforcesUser(prisma, user.id, user.cfHandle);
  revalidatePath("/learn");
  revalidatePath("/");
  revalidatePath("/analytics");
  return r;
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
}) {
  const user = await currentUser();
  await prisma.reflection.create({
    data: {
      userId: user.id,
      problemId: input.problemId,
      solveState: input.solved ? "UPSOLVED" : "UNSOLVED",
      stuckLevel: input.stuckLevel,
      failReason: input.failReason ?? null,
      bugType: input.bugType ?? null,
      note: input.note ?? "",
      timeSpentMin: input.timeSpentMin ?? null,
    },
  });
  if (input.solved) await toggleSolved(input.problemId, true);
  revalidatePath(`/problems/${input.problemId}`);
  revalidatePath("/reflect");
}
