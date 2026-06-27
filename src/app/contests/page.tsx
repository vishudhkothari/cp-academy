import Link from "next/link";
import { Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { createContest } from "@/app/actions";

export const dynamic = "force-dynamic";

const CADENCES: { kind: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY_MOCK"; label: string; sub: string }[] = [
  { kind: "DAILY", label: "Daily mini", sub: "45 min · 2 problems" },
  { kind: "WEEKLY", label: "Weekly", sub: "90 min · 3 problems" },
  { kind: "MONTHLY", label: "Monthly", sub: "3 hr · 5 problems" },
  { kind: "QUARTERLY_MOCK", label: "Mock ICPC", sub: "5 hr · 5 problems" },
];

const KIND_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY_MOCK: "Mock ICPC",
};

// Time-derived state, kept out of render scope (react-hooks/purity).
function contestTiming(startsAt: Date, durationMin: number) {
  const endsAt = startsAt.getTime() + durationMin * 60000;
  return { endsAt, live: Date.now() < endsAt };
}

export default async function ContestsPage() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  const contests = await prisma.contest.findMany({
    orderBy: { startsAt: "desc" },
    include: { problems: { select: { problemId: true } } },
  });

  const allPids = [...new Set(contests.flatMap((c) => c.problems.map((p) => p.problemId)))];
  const acs = user
    ? await prisma.submission.findMany({
        where: { userId: user.id, verdict: "AC", problemId: { in: allPids } },
        select: { problemId: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const earliestAc = new Map<string, Date>();
  for (const a of acs) if (!earliestAc.has(a.problemId)) earliestAc.set(a.problemId, a.createdAt);

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contests</h1>
        <p className="mt-1 text-sm text-muted">
          Problems target one axis each and adapt to your readiness band. You&apos;re
          not meant to solve them all;{" "}
          <strong className="text-foreground">upsolving is where the learning is</strong>.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CADENCES.map((c) => (
            <form key={c.kind} action={createContest.bind(null, c.kind)}>
              <button
                type="submit"
                className="w-full rounded-lg border border-border bg-surface p-3 text-left hover:border-accent hover:bg-surface-2/50"
              >
                <div className="text-sm font-medium">{c.label}</div>
                <div className="mt-0.5 text-xs text-muted">{c.sub}</div>
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {contests.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
            No contests yet. Start your first weekly contest above.
          </div>
        )}
        {contests.map((c) => {
          const { endsAt, live } = contestTiming(c.startsAt, c.durationMin);
          let inContest = 0;
          let upsolved = 0;
          for (const p of c.problems) {
            const ac = earliestAc.get(p.problemId);
            if (!ac) continue;
            if (ac.getTime() <= endsAt) inContest++;
            else upsolved++;
          }
          return (
            <Link
              key={c.id}
              href={`/contests/${c.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:bg-surface-2/50"
            >
              <div className="flex items-center gap-3">
                <Trophy size={18} className="text-muted" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.title}</span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                      {KIND_LABEL[c.kind] ?? c.kind}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {c.startsAt.toLocaleString("en-GB")} · {c.durationMin} min
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-ac">{inContest} in-contest</span>
                <span className="text-muted">{upsolved} upsolved</span>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    background: live ? "var(--accent)" : "var(--surface-2)",
                    color: live ? "var(--accent-foreground)" : "var(--muted)",
                  }}
                >
                  {live ? "Live" : "Ended"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
