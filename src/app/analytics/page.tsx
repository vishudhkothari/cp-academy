import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { getMasteryByTopic, getAxisAverages, AXES as MASTERY_AXES } from "@/lib/engine/mastery";
import { computeReadiness } from "@/lib/engine/readiness";

export const dynamic = "force-dynamic";

const AXIS_META: Record<string, { label: string; color: string }> = {
  OBSERVATION: { label: "Observation", color: "var(--obs)" },
  TECHNIQUE: { label: "Technique", color: "var(--tech)" },
  IMPLEMENTATION: { label: "Implementation", color: "var(--impl)" },
};

function masteryColor(score: number): string {
  if (score <= 0) return "var(--surface-2)";
  if (score < 0.34) return "rgba(239,94,107,.55)";
  if (score < 0.67) return "rgba(240,161,58,.6)";
  return "var(--ac)";
}

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

  const [masteryByTopic, axisAvgs, readiness, readinessSnaps] = await Promise.all([
    getMasteryByTopic(prisma, user.id),
    getAxisAverages(prisma, user.id),
    computeReadiness(prisma, user.id),
    prisma.ratingSnapshot.findMany({
      where: { userId: user.id, kind: "READINESS" },
      orderBy: { takenAt: "asc" },
      select: { value: true },
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

  return { solved, allSubs, reflections, coachTopics, ratings, masteryByTopic, axisAvgs, readiness, readinessSnaps };
}

function masteryOf(arr: number[]) {
  if (!arr.length) return { pct: 0, max: 0, n: 0 };
  const max = Math.max(...arr);
  return { pct: Math.min(100, Math.max(0, ((max - 800) / (2000 - 800)) * 100)), max, n: arr.length };
}

export default async function AnalyticsPage() {
  const data = await getData();
  if (!data) return <div className="p-10 text-muted">No user.</div>;
  const { solved, allSubs, reflections, coachTopics, ratings, masteryByTopic, axisAvgs, readiness, readinessSnaps } = data;
  const hasMastery = axisAvgs.some((a) => a.topics > 0);

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

      {/* Readiness */}
      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-medium">Readiness</h2>
          <span className="text-xs text-muted">{readiness.band}</span>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="text-3xl font-semibold" style={{ color: "var(--ac)" }}>
            {readiness.score}
            <span className="text-base text-muted">/100</span>
          </div>
          {readinessSnaps.length > 1 && (
            <svg viewBox="0 0 200 32" className="h-8 flex-1" preserveAspectRatio="none">
              <polyline
                fill="none"
                stroke="var(--ac)"
                strokeWidth="1.5"
                points={readinessSnaps
                  .map((s, i) => {
                    const x = (i / Math.max(1, readinessSnaps.length - 1)) * 200;
                    const y = 30 - (s.value / 100) * 28;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
          )}
        </div>
        <div className="mt-2 text-xs text-muted">{readiness.reasons.join(" · ")}</div>
        <div className="mt-1 text-xs text-muted">
          Contests currently target ~{readiness.bandRating}-rated problems.
        </div>
      </section>

      {/* Per-axis mastery (real, from the mastery model — falls back to a rating
          proxy until you've reflected on enough problems) */}
      {hasMastery ? (
        <section className="mt-6 grid gap-4 sm:grid-cols-3">
          {axisAvgs.map((a) => {
            const meta = AXIS_META[a.axis];
            return (
              <div key={a.axis} className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  <span className="text-sm font-medium" style={{ color: meta.color }}>
                    {meta.label}
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(a.score * 100)}%`, background: meta.color }}
                  />
                </div>
                <div className="mt-2 text-xs text-muted">
                  {a.topics ? `${Math.round(a.score * 100)}% · ${a.topics} topics` : "no data yet"}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
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
                {a.m.n ? `reached ${a.m.max} · ${a.m.n} solved (proxy)` : "no data yet — reflect to build mastery"}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Skill tree — per-topic, per-axis mastery. Nothing like it on LeetCode. */}
      {masteryByTopic.length > 0 && (
        <section className="mt-8 rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-medium">Skill tree</h2>
          <p className="mt-1 text-xs text-muted">
            Each topic across the three axes — find the exact cell that&apos;s failing.
          </p>
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center gap-2 pl-[40%] text-[10px] uppercase tracking-wide text-muted">
              {MASTERY_AXES.map((axis) => (
                <span key={axis} className="flex-1 text-center">
                  {AXIS_META[axis].label.slice(0, 3)}
                </span>
              ))}
            </div>
            {masteryByTopic.map((t) => (
              <div key={t.topicId} className="flex items-center gap-2">
                <span className="w-[40%] truncate text-xs" title={t.topicName}>
                  {t.topicName}
                </span>
                {MASTERY_AXES.map((axis) => (
                  <span
                    key={axis}
                    className="flex h-6 flex-1 items-center justify-center rounded text-[10px] tabular-nums"
                    style={{
                      background: masteryColor(t.scores[axis]),
                      color: t.scores[axis] >= 0.34 ? "#0b0f17" : "var(--muted)",
                    }}
                    title={`${AXIS_META[axis].label}: ${Math.round(t.scores[axis] * 100)}% (${t.attempts[axis]} attempts)`}
                  >
                    {t.attempts[axis] > 0 ? Math.round(t.scores[axis] * 100) : "·"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

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
