import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { ContestTimer } from "@/components/contest-timer";

export const dynamic = "force-dynamic";

const AXIS: Record<string, { label: string; color: string; role: string }> = {
  OBSERVATION: { label: "Observation", color: "var(--obs)", role: "Review" },
  TECHNIQUE: { label: "Technique", color: "var(--tech)", role: "Current topic" },
  IMPLEMENTATION: { label: "Implementation", color: "var(--impl)", role: "Implementation" },
};

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
  const endsAt = contest.startsAt.getTime() + contest.durationMin * 60000;
  const live = Date.now() < endsAt;

  const pids = contest.problems.map((p) => p.problemId);
  const acs = user
    ? await prisma.submission.findMany({
        where: { userId: user.id, verdict: "AC", problemId: { in: pids } },
        select: { problemId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const earliestAc = new Map<string, Date>();
  for (const a of acs) if (!earliestAc.has(a.problemId)) earliestAc.set(a.problemId, a.createdAt);

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
        <div className="mt-8 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Result</h2>
          <div className="mt-2 flex gap-5 text-sm">
            <span className="text-ac">{inContest} solved in contest</span>
            <span className="text-tech">{upsolved} upsolved</span>
            <span className="text-muted">{backlog.length} still to upsolve</span>
          </div>
          {backlog.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wide text-muted">Upsolve backlog</div>
              <ul className="mt-2 space-y-1.5">
                {backlog.map((cp) => (
                  <li key={cp.id}>
                    <Link
                      href={`/problems/${cp.problem.id}`}
                      className="text-sm hover:text-accent"
                    >
                      {String.fromCharCode(65 + cp.slot)}. {cp.problem.title} →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
