import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

const FAIL_LABEL: Record<string, string> = {
  OBSERVATION: "Observation gap",
  TECHNIQUE: "Didn't know technique",
  IMPLEMENTATION: "Couldn't implement",
  DEBUG: "Bugs / debugging",
  TIME: "Time pressure",
  CARELESS: "Careless",
};

async function getData() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) return null;
  const [solved, allSubs, reflections, coach, ratings] = await Promise.all([
    prisma.submission.findMany({
      where: { userId: user.id, verdict: "AC" },
      distinct: ["problemId"],
      select: {
        problem: {
          select: {
            sourceRating: true,
            topic: { select: { name: true, lean: true, slug: true } },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: { userId: user.id },
      select: { createdAt: true },
    }),
    prisma.reflection.findMany({
      where: { userId: user.id },
      select: { failReason: true, bugType: true, stuckLevel: true },
    }),
    prisma.coachUsage.findMany({
      where: { userId: user.id, maxLevel: { gt: 0 } },
      select: { maxLevel: true, problemId: true },
    }),
    prisma.ratingSnapshot.findMany({
      where: { userId: user.id, kind: "CF_REAL" },
      orderBy: { takenAt: "asc" },
      select: { value: true, takenAt: true },
    }),
  ]);

  // CoachUsage has no problem relation — resolve topic names separately.
  const coachProblems = coach.length
    ? await prisma.problem.findMany({
        where: { id: { in: coach.map((c) => c.problemId) } },
        select: { id: true, topic: { select: { name: true } } },
      })
    : [];
  const topicByPid = new Map(coachProblems.map((p) => [p.id, p.topic?.name ?? "—"]));
  const coachTopics = coach.map((c) => ({
    maxLevel: c.maxLevel,
    topic: topicByPid.get(c.problemId) ?? "—",
  }));

  return { solved, allSubs, reflections, coachTopics, ratings };
}

function masteryOf(arr: number[]) {
  if (!arr.length) return { pct: 0, max: 0, n: 0 };
  const max = Math.max(...arr);
  return { pct: Math.min(100, Math.max(0, ((max - 800) / (2000 - 800)) * 100)), max, n: arr.length };
}

export default async function AnalyticsPage() {
  const data = await getData();
  if (!data) return <div className="p-10 text-muted">No user.</div>;
  const { solved, allSubs, reflections, coachTopics, ratings } = data;

  // Per-axis mastery (proxy from topic lean + rating until manual tags accrue).
  const obs: number[] = [], tech: number[] = [], impl: number[] = [];
  const solvedByTopic = new Map<string, number>();
  for (const s of solved) {
    const r = s.problem.sourceRating ?? 0;
    const lean = s.problem.topic?.lean;
    const slug = s.problem.topic?.slug;
    const tname = s.problem.topic?.name;
    if (tname) solvedByTopic.set(tname, (solvedByTopic.get(tname) ?? 0) + 1);
    if (!r) continue;
    if (lean === "OBSERVATION_HEAVY") obs.push(r);
    else if (lean === "TECHNIQUE_HEAVY") tech.push(r);
    if (slug === "implementation" || lean === "MIXED") impl.push(r);
  }
  const AXES = [
    { label: "Observation", color: "var(--obs)", m: masteryOf(obs) },
    { label: "Technique", color: "var(--tech)", m: masteryOf(tech) },
    { label: "Implementation", color: "var(--impl)", m: masteryOf(impl) },
  ];

  // Activity heatmap (last 84 days).
  const byDay = new Map<string, number>();
  for (const s of allSubs) {
    const k = s.createdAt.toISOString().slice(0, 10);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days: { date: string; count: number }[] = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    days.push({ date: k, count: byDay.get(k) ?? 0 });
  }
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const cellColor = (c: number) =>
    c === 0 ? "var(--surface-2)" : c < 3 ? "rgba(69,201,138,.35)" : c < 6 ? "rgba(69,201,138,.65)" : "var(--ac)";

  // Weakness signals.
  const failCounts = new Map<string, number>();
  const bugCounts = new Map<string, number>();
  for (const r of reflections) {
    if (r.failReason) failCounts.set(r.failReason, (failCounts.get(r.failReason) ?? 0) + 1);
    if (r.bugType) bugCounts.set(r.bugType, (bugCounts.get(r.bugType) ?? 0) + 1);
  }
  const topFails = [...failCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const topBugs = [...bugCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const coachByTopic = new Map<string, number>();
  for (const c of coachTopics) {
    coachByTopic.set(c.topic, Math.max(coachByTopic.get(c.topic) ?? 0, c.maxLevel));
  }
  const topCoach = [...coachByTopic.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);

  const latestRating = ratings.at(-1)?.value;
  const maxR = Math.max(1, ...ratings.map((r) => r.value));
  const minR = Math.min(...(ratings.length ? ratings.map((r) => r.value) : [0]));

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-muted">
        The three axes, separately. This is the whole point — find which one is
        failing and train it.
      </p>

      {/* Per-axis mastery */}
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        {AXES.map((a) => (
          <div key={a.label} className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: a.color }} />
              <span className="text-sm font-medium" style={{ color: a.color }}>
                {a.label}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${a.m.pct}%`, background: a.color }} />
            </div>
            <div className="mt-2 text-xs text-muted">
              {a.m.n ? `reached ${a.m.max} · ${a.m.n} solved` : "no data yet — solve problems here"}
            </div>
          </div>
        ))}
      </section>

      {/* Activity heatmap */}
      <section className="mt-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-medium">Activity</h2>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {weeks.map((w, i) => (
            <div key={i} className="flex flex-col gap-1">
              {w.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count}`}
                  className="h-3 w-3 rounded-sm"
                  style={{ background: cellColor(d.count) }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 text-xs text-muted">Last 12 weeks · {allSubs.length} submissions</div>
      </section>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {/* Weakness dashboard */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Weaknesses</h2>
          {topFails.length === 0 && topBugs.length === 0 && topCoach.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              Reflect after problems (and use the Coach) to surface your recurring
              weaknesses here.
            </p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              {topFails.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted">Why you got stuck</div>
                  {topFails.map(([k, v]) => (
                    <div key={k} className="mt-1 flex justify-between">
                      <span>{FAIL_LABEL[k] ?? k}</span>
                      <span className="text-muted">{v}×</span>
                    </div>
                  ))}
                </div>
              )}
              {topBugs.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted">Most common bugs</div>
                  {topBugs.map(([k, v]) => (
                    <div key={k} className="mt-1 flex justify-between">
                      <span>{k.toLowerCase().replace("_", " ")}</span>
                      <span className="text-muted">{v}×</span>
                    </div>
                  ))}
                </div>
              )}
              {topCoach.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted">Needed the most hints</div>
                  {topCoach.map(([k, v]) => (
                    <div key={k} className="mt-1 flex justify-between">
                      <span>{k}</span>
                      <span className="text-muted">L{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Rating + topic coverage */}
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Codeforces rating</h2>
          {ratings.length === 0 ? (
            <p className="mt-2 text-xs text-muted">
              No rated contests yet. Compete on Codeforces and re-sync to chart your
              rating here.
            </p>
          ) : (
            <>
              <div className="mt-1 text-2xl font-semibold" style={{ color: ratingColor(latestRating) }}>
                {latestRating}
              </div>
              <svg viewBox="0 0 200 40" className="mt-2 w-full" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke={ratingColor(latestRating)}
                  strokeWidth="1.5"
                  points={ratings
                    .map((r, i) => {
                      const x = (i / Math.max(1, ratings.length - 1)) * 200;
                      const y = 38 - ((r.value - minR) / Math.max(1, maxR - minR)) * 36;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
              </svg>
            </>
          )}
          <h2 className="mt-5 text-sm font-medium">Topic coverage</h2>
          {solvedByTopic.size === 0 ? (
            <p className="mt-2 text-xs text-muted">Solve problems to build coverage.</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...solvedByTopic.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <span key={t} className="rounded bg-surface-2 px-2 py-1 text-xs">
                  {t} <span className="text-ac">{n}</span>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
