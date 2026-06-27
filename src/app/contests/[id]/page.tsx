import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { ContestTimer } from "@/components/contest-timer";
import { ReflectionForm } from "@/components/reflection-form";

export const dynamic = "force-dynamic";

const AXIS: Record<string, { label: string; color: string; role: string }> = {
  OBSERVATION: { label: "Observation", color: "var(--obs)", role: "Review" },
  TECHNIQUE: { label: "Technique", color: "var(--tech)", role: "Current topic" },
  IMPLEMENTATION: { label: "Implementation", color: "var(--impl)", role: "Implementation" },
};

// Time-derived state, kept out of render scope (react-hooks/purity).
function contestTiming(startsAt: Date, durationMin: number) {
  const endsAt = startsAt.getTime() + durationMin * 60000;
  const nowMs = Date.now();
  return {
    endsAt,
    live: nowMs < endsAt,
    ageDays: Math.max(0, Math.floor((nowMs - endsAt) / 86400_000)),
  };
}

export default async function ContestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contest = await prisma.contest.findUnique({
    where: { id },
    include: {
      problems: {
        orderBy: { slot: "asc" },
        include: {
          problem: {
            select: {
              id: true,
              title: true,
              externalId: true,
              sourceRating: true,
              topic: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!contest) notFound();

  const user = await prisma.user.findFirst({ select: { id: true } });
  const { endsAt, live, ageDays } = contestTiming(contest.startsAt, contest.durationMin);

  const pids = contest.problems.map((p) => p.problemId);
  const [acs, contestReflections] = user
    ? await Promise.all([
        prisma.submission.findMany({
          where: { userId: user.id, verdict: "AC", problemId: { in: pids } },
          select: { problemId: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        }),
        prisma.reflection.findMany({
          where: { userId: user.id, contestId: id },
          select: { problemId: true },
        }),
      ])
    : [[], []];
  const earliestAc = new Map<string, Date>();
  for (const a of acs) if (!earliestAc.has(a.problemId)) earliestAc.set(a.problemId, a.createdAt);
  const reflected = new Set(contestReflections.map((r) => r.problemId));

  function statusOf(problemId: string): "in" | "up" | "none" {
    const ac = earliestAc.get(problemId);
    if (!ac) return "none";
    return ac.getTime() <= endsAt ? "in" : "up";
  }

  const inContest = contest.problems.filter((p) => statusOf(p.problemId) === "in").length;
  const upsolved = contest.problems.filter((p) => statusOf(p.problemId) === "up").length;
  const backlog = contest.problems.filter((p) => statusOf(p.problemId) === "none");

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <Link href="/contests" className="text-xs text-muted hover:text-foreground">
        ← Contests
      </Link>

      <div className="mt-2 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{contest.title}</h1>
        <ContestTimer endsAt={endsAt} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {live
          ? "You're not expected to solve all three. Pick what's in reach; bring the rest home to upsolve."
          : "Contest ended. The real learning is upsolving what you missed."}
      </p>

      <div className="mt-6 space-y-3">
        {contest.problems.map((cp) => {
          const a = AXIS[cp.targetAxis];
          const st = statusOf(cp.problemId);
          const p = cp.problem;
          return (
            <Link
              key={cp.id}
              href={`/problems/${p.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:bg-surface-2/50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-semibold"
                  style={{ background: `${a.color}22`, color: a.color }}
                >
                  {String.fromCharCode(65 + cp.slot)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.title}</div>
                  <div className="text-xs" style={{ color: a.color }}>
                    {a.role} · {a.label}
                    <span className="text-muted">
                      {" "}
                      · {p.externalId}
                      {p.topic ? ` · ${p.topic.name}` : ""}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {p.sourceRating && (
                  <span
                    className="text-sm font-semibold tabular-nums"
                    style={{ color: ratingColor(p.sourceRating) }}
                  >
                    {p.sourceRating}
                  </span>
                )}
                <span className="w-24 text-right text-xs">
                  {st === "in" ? (
                    <span className="text-ac">✓ in-contest</span>
                  ) : st === "up" ? (
                    <span className="text-tech">✓ upsolved</span>
                  ) : (
                    <span className="text-muted">{live ? "open" : "to upsolve"}</span>
                  )}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {!live && (
        <div className="mt-8 space-y-4">
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">Result</h2>
            <div className="mt-2 flex gap-5 text-sm">
              <span className="text-ac">{inContest} solved in contest</span>
              <span className="text-tech">{upsolved} upsolved</span>
              <span className="text-muted">{backlog.length} still to upsolve</span>
            </div>
            {backlog.length > 0 && (
              <p className="mt-2 text-xs text-muted">
                Upsolve backlog is {ageDays}d old. The real learning is bringing these home.
              </p>
            )}
          </div>

          {/* Per-problem reflection — grading lives in the upsolve (paper P3). */}
          <div className="rounded-lg border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">Reflect on each problem</h2>
            <p className="mt-1 text-xs text-muted">
              One reflection per problem — this is what feeds your 3-axis mastery and
              surfaces your real weakness.
            </p>
            <div className="mt-4 space-y-4">
              {contest.problems.map((cp) => {
                const st = statusOf(cp.problemId);
                const a = AXIS[cp.targetAxis];
                const isReflected = reflected.has(cp.problemId);
                return (
                  <div key={cp.id} className="rounded-md border border-border/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/problems/${cp.problem.id}`}
                        className="truncate text-sm font-medium hover:text-accent"
                      >
                        {String.fromCharCode(65 + cp.slot)}. {cp.problem.title}
                      </Link>
                      <span className="shrink-0 text-xs" style={{ color: a.color }}>
                        {a.label}
                      </span>
                    </div>
                    <div className="mt-3">
                      {isReflected ? (
                        <div className="text-xs text-ac">Reflected ✓</div>
                      ) : (
                        <ReflectionForm
                          problemId={cp.problem.id}
                          solved={st !== "none"}
                          contestId={contest.id}
                          inContest={st === "in"}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
