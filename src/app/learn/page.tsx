import Link from "next/link";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { SolveToggle } from "@/components/solve-toggle";
import { ResyncButton } from "@/components/resync-button";

export const dynamic = "force-dynamic";

const LEAN_LABEL: Record<string, { t: string; c: string }> = {
  OBSERVATION_HEAVY: { t: "observation", c: "var(--obs)" },
  TECHNIQUE_HEAVY: { t: "technique", c: "var(--tech)" },
  MIXED: { t: "mixed", c: "var(--muted)" },
};

function tierColor(tier: string) {
  return tier === "core" ? "var(--impl)" : tier === "extra" ? "var(--tech)" : "var(--wa)";
}

async function getPath() {
  const [topics, solvedRows, user] = await Promise.all([
    prisma.topic.findMany({
      where: { curated: { some: {} } },
      orderBy: [{ month: "asc" }, { name: "asc" }],
      include: {
        curated: {
          orderBy: { order: "asc" },
          include: {
            problem: {
              select: {
                id: true,
                title: true,
                url: true,
                source: true,
                sourceRating: true,
                csesSection: true,
              },
            },
          },
        },
      },
    }),
    prisma.submission.findMany({
      where: { verdict: "AC" },
      distinct: ["problemId"],
      select: { problemId: true },
    }),
    prisma.user.findFirst({ select: { id: true } }),
  ]);
  void user;
  const solved = new Set(solvedRows.map((s) => s.problemId));
  return { topics, solved };
}

export default async function LearnPage() {
  const { topics, solved } = await getPath();

  // The single next unsolved problem, in path order, + global progress.
  let next:
    | { id: string; topicName: string; month: number; title: string }
    | null = null;
  let totalCurated = 0;
  let totalSolved = 0;
  for (const t of topics) {
    for (const c of t.curated) {
      totalCurated++;
      if (solved.has(c.problem.id)) totalSolved++;
      else if (!next)
        next = {
          id: c.problem.id,
          topicName: t.name,
          month: t.month,
          title: c.problem.title,
        };
    }
  }

  // Group topics by month.
  const months = [...new Set(topics.map((t) => t.month))].sort((a, b) => a - b);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Learning Path</h1>
        <div className="text-sm text-muted">
          {totalSolved}/{totalCurated} solved
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        Your curated route to full coverage — CSES&apos;s canonical sequence plus
        Codeforces difficulty ramps. Follow it top to bottom; you never have to
        wonder what to solve.
      </p>

      <div className="mt-4">
        <ResyncButton />
      </div>

      {next && (
        <Link
          href={`/problems/${next.id}`}
          className="mt-6 block rounded-xl border border-accent/40 bg-accent/10 p-5 hover:bg-accent/15"
        >
          <div className="text-xs uppercase tracking-wide text-accent">Next up</div>
          <div className="mt-1 text-lg font-medium">{next.title}</div>
          <div className="mt-0.5 text-sm text-muted">
            Month {next.month} · {next.topicName} · Solve →
          </div>
        </Link>
      )}

      <div className="mt-8 space-y-8">
        {months.map((month) => {
          const monthTopics = topics.filter((t) => t.month === month);
          const mTotal = monthTopics.reduce((s, t) => s + t.curated.length, 0);
          const mDone = monthTopics.reduce(
            (s, t) => s + t.curated.filter((c) => solved.has(c.problem.id)).length,
            0,
          );
          return (
            <section key={month}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                  Month {month}
                </h2>
                <div className="flex items-center gap-2">
                  <div className="h-1 w-20 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-ac"
                      style={{ width: `${mTotal ? (mDone / mTotal) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-muted">
                    {mDone}/{mTotal}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {monthTopics.map((t) => {
                  const total = t.curated.length;
                  const done = t.curated.filter((c) => solved.has(c.problem.id)).length;
                  const hasNext =
                    next &&
                    t.curated.some(
                      (c) => !solved.has(c.problem.id) && c.problem.title === next!.title,
                    );
                  const lean = LEAN_LABEL[t.lean];
                  return (
                    <details
                      key={t.id}
                      open={Boolean(hasNext)}
                      className="group rounded-lg border border-border bg-surface"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: lean.c }}
                            title={lean.t}
                          />
                          <span className="font-medium">{t.name}</span>
                          <span className="text-xs text-muted">{lean.t}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-ac"
                              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="w-12 text-right text-xs tabular-nums text-muted">
                            {done}/{total}
                          </span>
                        </div>
                      </summary>
                      {t.description && (
                        <p className="border-t border-border bg-surface-2/30 px-4 py-2.5 text-xs text-muted">
                          {t.description}
                        </p>
                      )}
                      <ol className="border-t border-border">
                        {t.curated.map((c, i) => {
                          const p = c.problem;
                          const isSolved = solved.has(p.id);
                          return (
                            <li
                              key={c.id}
                              className="flex items-center gap-3 border-b border-border/60 px-4 py-2 text-sm last:border-0 hover:bg-surface-2/40"
                            >
                              <span className="w-5 text-center text-xs text-muted tabular-nums">
                                {i + 1}
                              </span>
                              <span className="w-4 text-center">
                                <SolveToggle problemId={p.id} solved={isSolved} size={15} />
                              </span>
                              <span
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: tierColor(c.tier) }}
                                title={c.tier}
                              />
                              <Link
                                href={`/problems/${p.id}`}
                                className="flex-1 truncate hover:text-accent"
                              >
                                {p.title}
                              </Link>
                              <span className="text-xs text-muted">
                                {p.source === "CSES" ? "CSES" : "CF"}
                              </span>
                              <span
                                className="w-9 text-right text-xs tabular-nums"
                                style={{ color: ratingColor(p.sourceRating) }}
                              >
                                {p.sourceRating ?? "—"}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    </details>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
