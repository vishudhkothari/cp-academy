import "katex/dist/katex.min.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { fetchAndRenderStatement } from "@/lib/sources/statement";
import { Workspace } from "@/components/workspace";
import { ProblemTabs } from "@/components/problem-tabs";
import { SplitPane } from "@/components/split-pane";
import { SolveToggle } from "@/components/solve-toggle";

export const dynamic = "force-dynamic";

// The next problem in curated-path order: next in this topic's ladder, else the
// first problem of the next topic (by month, then name).
async function getNextProblemId(currentId: string): Promise<string | null> {
  const cur = await prisma.curatedProblem.findFirst({
    where: { problemId: currentId },
    include: { topic: { select: { month: true, name: true } } },
  });
  if (!cur) return null;

  const sameTopic = await prisma.curatedProblem.findFirst({
    where: { topicId: cur.topicId, order: { gt: cur.order } },
    orderBy: { order: "asc" },
    select: { problemId: true },
  });
  if (sameTopic) return sameTopic.problemId;

  const nextTopic = await prisma.topic.findFirst({
    where: {
      curated: { some: {} },
      OR: [
        { month: { gt: cur.topic.month } },
        { month: cur.topic.month, name: { gt: cur.topic.name } },
      ],
    },
    orderBy: [{ month: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  if (!nextTopic) return null;

  const first = await prisma.curatedProblem.findFirst({
    where: { topicId: nextTopic.id },
    orderBy: { order: "asc" },
    select: { problemId: true },
  });
  return first?.problemId ?? null;
}

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const problem = await prisma.problem.findUnique({
    where: { id },
    include: { topic: true },
  });
  if (!problem) notFound();

  const user = await prisma.user.findFirst({ select: { id: true } });
  const [solvedSub, reflections, coach, nextId] = await Promise.all([
    prisma.submission.findFirst({ where: { problemId: id, verdict: "AC" } }),
    prisma.reflection.findMany({
      where: { problemId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, stuckLevel: true, bugType: true, note: true },
    }),
    user
      ? prisma.coachUsage.findUnique({
          where: { userId_problemId: { userId: user.id, problemId: id } },
        })
      : null,
    getNextProblemId(id),
  ]);
  const solved = Boolean(solvedSub);

  // Statement: fetch once from the source, then cache in the DB.
  let statementHtml = problem.statementHtml;
  if (!statementHtml) {
    statementHtml = await fetchAndRenderStatement(problem.source, problem.url);
    if (statementHtml) {
      await prisma.problem.update({ where: { id }, data: { statementHtml } });
    }
  }

  const filenameBase = `${problem.externalId.replace(/[^\w]+/g, "")}_${problem.title
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <SolveToggle problemId={problem.id} solved={solved} size={18} />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight">{problem.title}</h1>
            <div className="truncate text-xs text-muted">
              {problem.source} · {problem.externalId}
              {problem.topic ? ` · ${problem.topic.name}` : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {problem.sourceRating && (
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: ratingColor(problem.sourceRating) }}
            >
              {problem.sourceRating}
            </span>
          )}
          {nextId && (
            <Link
              href={`/problems/${nextId}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
            >
              Next <ChevronRight size={14} />
            </Link>
          )}
        </div>
      </header>

      <SplitPane
        left={
          <ProblemTabs
            problemId={problem.id}
            title={problem.title}
            statementHtml={statementHtml}
            url={problem.url}
            obs={problem.obsDifficulty}
            tech={problem.techDifficulty}
            impl={problem.implDifficulty}
            solved={solved}
            reflections={reflections}
            coachLevel={coach?.maxLevel ?? 0}
          />
        }
        right={<Workspace problemId={problem.id} filenameBase={filenameBase} />}
      />
    </div>
  );
}
