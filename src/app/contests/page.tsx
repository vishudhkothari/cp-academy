import Link from "next/link";
import { Trophy, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { createWeeklyContest } from "@/app/actions";

export const dynamic = "force-dynamic";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contests</h1>
          <p className="mt-1 text-sm text-muted">
            90 minutes, 3 problems — one per axis. You&apos;re not meant to solve all
            three; <strong className="text-foreground">upsolving is where the learning is</strong>.
          </p>
        </div>
        <form action={createWeeklyContest}>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <Plus size={15} /> Start weekly contest
          </button>
        </form>
      </div>

      <div className="mt-8 space-y-3">
        {contests.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
            No contests yet. Start your first weekly contest above.
          </div>
        )}
        {contests.map((c) => {
          const endsAt = c.startsAt.getTime() + c.durationMin * 60000;
          const live = Date.now() < endsAt;
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
                  <div className="text-sm font-medium">{c.title}</div>
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
