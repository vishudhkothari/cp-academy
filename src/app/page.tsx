import Link from "next/link";
import { Brain, Target, ListChecks, Trophy, RotateCcw, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { getCoachInsights, type Insight } from "@/lib/engine/coach-insights";
import { getTodayPlan, type PlanItem } from "@/lib/engine/daily-plan";

export const dynamic = "force-dynamic";

const PLAN_ICON: Record<PlanItem["type"], LucideIcon> = {
  REVIEW: Brain,
  WEAKNESS: Target,
  PROBLEM: ListChecks,
  CONTEST: Trophy,
  UPSOLVE: RotateCcw,
};

function PlanPanel({ items }: { items: PlanItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Today&apos;s plan</h2>
      <div className="mt-3 space-y-2">
        {items.map((it, i) => {
          const Icon = PLAN_ICON[it.type];
          return (
            <Link
              key={i}
              href={it.href}
              className="flex items-start gap-3 rounded-lg border border-border bg-surface p-3.5 hover:bg-surface-2/50"
            >
              <Icon size={16} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{it.title}</div>
                <div className="mt-0.5 text-xs text-muted">{it.reason}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const TONE: Record<Insight["tone"], string> = {
  ready: "var(--ac)",
  basics: "var(--accent)",
  start: "var(--accent)",
  weak: "var(--tech)",
  pattern: "var(--wa)",
};

function CoachPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Coach</h2>
      <div className="mt-3 space-y-2.5">
        {insights.map((it, i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
            style={{ borderLeft: `3px solid ${TONE[it.tone]}` }}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium" style={{ color: TONE[it.tone] }}>
                {it.title}
              </div>
              <p className="mt-1 text-sm text-muted leading-relaxed">{it.body}</p>
            </div>
            {it.action &&
              (it.action.external ? (
                <a
                  href={it.action.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                >
                  {it.action.label} ↗
                </a>
              ) : (
                <Link
                  href={it.action.href}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                >
                  {it.action.label} →
                </Link>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}

async function getStats() {
  const [solvedRows, latestRating, recentContest, curated] = await Promise.all([
    prisma.submission.findMany({
      where: { verdict: "AC" },
      distinct: ["problemId"],
      select: { problemId: true },
    }),
    prisma.ratingSnapshot.findFirst({
      where: { kind: "CF_REAL" },
      orderBy: { takenAt: "desc" },
    }),
    prisma.contest.findFirst({ orderBy: { startsAt: "desc" } }),
    prisma.curatedProblem.findMany({
      orderBy: [{ topic: { month: "asc" } }, { topic: { name: "asc" } }, { order: "asc" }],
      select: {
        problemId: true,
        problem: { select: { id: true, title: true } },
        topic: { select: { name: true, month: true } },
      },
    }),
  ]);

  const solvedSet = new Set(solvedRows.map((s) => s.problemId));
  let nextUp: { id: string; title: string; topic: string; month: number } | null = null;
  let pathSolved = 0;
  for (const c of curated) {
    if (solvedSet.has(c.problemId)) pathSolved++;
    else if (!nextUp)
      nextUp = { id: c.problem.id, title: c.problem.title, topic: c.topic.name, month: c.topic.month };
  }

  let liveContest: { id: string; title: string } | null = null;
  if (recentContest) {
    const ends = recentContest.startsAt.getTime() + recentContest.durationMin * 60000;
    if (Date.now() < ends) liveContest = { id: recentContest.id, title: recentContest.title };
  }

  return {
    solved: solvedSet.size,
    latestRating,
    nextUp,
    liveContest,
    pathSolved,
    pathTotal: curated.length,
  };
}

function Stat({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const { solved, latestRating, nextUp, liveContest, pathSolved, pathTotal } = await getStats();
  const user = await prisma.user.findFirst({ select: { id: true } });
  const insights = user ? await getCoachInsights(prisma, user.id) : [];
  const plan = user ? await getTodayPlan(prisma, user.id) : [];

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">What to work on today.</p>

      <CoachPanel insights={insights} />

      <PlanPanel items={plan} />

      {/* Today */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {nextUp ? (
          <Link
            href={`/problems/${nextUp.id}`}
            className="rounded-xl border border-accent/40 bg-accent/10 p-5 hover:bg-accent/15"
          >
            <div className="text-xs uppercase tracking-wide text-accent">Up next on your path</div>
            <div className="mt-1 text-lg font-medium">{nextUp.title}</div>
            <div className="mt-0.5 text-sm text-muted">
              Month {nextUp.month} · {nextUp.topic} · Solve →
            </div>
          </Link>
        ) : (
          <Link href="/learn" className="rounded-xl border border-border bg-surface p-5 hover:bg-surface-2/50">
            <div className="text-xs uppercase tracking-wide text-muted">Path</div>
            <div className="mt-1 text-lg font-medium">Open your learning path →</div>
          </Link>
        )}

        {liveContest ? (
          <Link
            href={`/contests/${liveContest.id}`}
            className="rounded-xl border border-tech/40 bg-tech/10 p-5 hover:bg-tech/15"
          >
            <div className="text-xs uppercase tracking-wide text-tech">Contest live</div>
            <div className="mt-1 text-lg font-medium">{liveContest.title}</div>
            <div className="mt-0.5 text-sm text-muted">Resume the timer →</div>
          </Link>
        ) : (
          <Link href="/contests" className="rounded-xl border border-border bg-surface p-5 hover:bg-surface-2/50">
            <div className="text-xs uppercase tracking-wide text-muted">Train under pressure</div>
            <div className="mt-1 text-lg font-medium">Start a weekly contest →</div>
            <div className="mt-0.5 text-sm text-muted">90 min · 3 problems · upsolve the rest</div>
          </Link>
        )}
      </div>

      {/* Compact stats */}
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="Path progress" value={`${pathSolved}/${pathTotal}`} sub="curated problems" />
        <Stat label="Solved" value={solved} sub="all-time" color="var(--ac)" />
        <Stat
          label="CF rating"
          value={latestRating?.value ?? "—"}
          sub={latestRating ? "from Codeforces" : "no rated contests yet"}
          color={ratingColor(latestRating?.value)}
        />
      </div>
    </div>
  );
}
