import Link from "next/link";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { getCoachInsights, type Insight } from "@/lib/engine/coach-insights";

export const dynamic = "force-dynamic";

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
  const [catalog, topics, solvedRows, latestRating, byMonth, recentContest, curated] =
    await Promise.all([
      prisma.problem.count(),
      prisma.topic.count(),
      prisma.submission.findMany({
        where: { verdict: "AC" },
        distinct: ["problemId"],
        select: { problemId: true },
      }),
      prisma.ratingSnapshot.findFirst({
        where: { kind: "CF_REAL" },
        orderBy: { takenAt: "desc" },
      }),
      prisma.topic.groupBy({ by: ["month"], _count: true, orderBy: { month: "asc" } }),
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
  for (const c of curated) {
    if (!solvedSet.has(c.problemId)) {
      nextUp = { id: c.problem.id, title: c.problem.title, topic: c.topic.name, month: c.topic.month };
      break;
    }
  }

  let liveContest: { id: string; title: string } | null = null;
  if (recentContest) {
    const ends = recentContest.startsAt.getTime() + recentContest.durationMin * 60000;
    if (Date.now() < ends) liveContest = { id: recentContest.id, title: recentContest.title };
  }

  return { catalog, topics, solved: solvedSet.size, latestRating, byMonth, nextUp, liveContest };
}

function Stat({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
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

const AXIS_CARDS = [
  {
    label: "Observation",
    color: "var(--obs)",
    desc: "Reduce an unknown problem to a known one. Greedy, DP, combinatorics lean here.",
  },
  {
    label: "Technique",
    color: "var(--tech)",
    desc: "Apply known algorithms & data structures. Segment trees, geometry, strings.",
  },
  {
    label: "Implementation",
    color: "var(--impl)",
    desc: "Code a correct, fast, debugged solution under time pressure.",
  },
];

export default async function DashboardPage() {
  const { catalog, topics, solved, latestRating, byMonth, nextUp, liveContest } =
    await getStats();
  const user = await prisma.user.findFirst({ select: { id: true } });
  const insights = user ? await getCoachInsights(prisma, user.id) : [];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-1 text-sm text-muted">
        A normal judge records one bit per problem. This one records three.
      </p>

      <CoachPanel insights={insights} />

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

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Catalog" value={catalog.toLocaleString()} sub="problems synced" />
        <Stat label="Solved" value={solved} sub="authoritative (OJ-synced)" color="var(--ac)" />
        <Stat label="Topics" value={topics} sub="12-month curriculum" />
        <Stat
          label="CF Rating"
          value={latestRating?.value ?? "—"}
          sub={latestRating ? "live from Codeforces" : "no rated contests yet"}
          color={ratingColor(latestRating?.value)}
        />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          The three axes
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {AXIS_CARDS.map((a) => (
            <div key={a.label} className="rounded-lg border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: a.color }}
                />
                <span className="font-medium" style={{ color: a.color }}>
                  {a.label}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted leading-relaxed">{a.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Curriculum coverage</h2>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {byMonth.map((m) => (
              <span
                key={m.month}
                className="rounded bg-surface-2 px-2 py-1 text-xs text-muted"
                title={`Month ${m.month}`}
              >
                M{m.month}
                <span className="ml-1 text-foreground">{m._count}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Topics per curriculum month.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Track your weaknesses</h2>
          <p className="mt-2 text-sm text-muted">
            See per-axis mastery, your activity, and the bugs &amp; gaps that keep
            tripping you up.
          </p>
          <Link
            href="/analytics"
            className="mt-4 inline-flex rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            Open analytics →
          </Link>
        </div>
      </section>
    </div>
  );
}
