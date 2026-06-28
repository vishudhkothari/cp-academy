import Link from "next/link";
import { Trophy, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/db";
import { createContest, setWeeklySlot } from "@/app/actions";
import { weeklySchedule, DAY_NAMES, formatHour } from "@/lib/engine/schedule";
import { WeeklyCountdown } from "@/components/weekly-countdown";

export const dynamic = "force-dynamic";

// Start-now cadences. The WEEKLY is handled separately as a fixed appointment.
const CADENCES: { kind: "DAILY" | "MONTHLY" | "QUARTERLY_MOCK"; label: string; sub: string }[] = [
  { kind: "DAILY", label: "Daily mini", sub: "45 min · 2 problems" },
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

function WeeklyPanel({
  day,
  hour,
  weekly,
}: {
  day: number;
  hour: number;
  weekly: { id: string; live: boolean; startsAt: Date } | null;
}) {
  const sch = weeklySchedule(day, hour);
  const doneThisWeek = !!weekly;

  // Resolve the panel's state once.
  let tone = "var(--muted)";
  let status = "";
  let countdown: { target: Date; prefix: string } | null = null;
  let startable = false;

  if (weekly?.live) {
    tone = "var(--accent)";
    status = "In progress";
  } else if (doneThisWeek) {
    tone = "var(--ac)";
    status = "Done this week";
    countdown = { target: sch.nextSlot, prefix: "next in " };
  } else if (sch.isOpen) {
    tone = "var(--ac)";
    status = "Open now";
    startable = true;
    countdown = { target: sch.openUntil, prefix: "closes in " };
  } else {
    tone = "var(--muted)";
    status = "Scheduled";
    countdown = { target: sch.nextSlot, prefix: "opens in " };
  }

  return (
    <section className="mt-6 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <CalendarClock size={18} className="mt-0.5 shrink-0" style={{ color: tone }} />
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium">Weekly contest</h2>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ color: tone }}>
                {status}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              Every <strong className="text-foreground">{sch.label}</strong>
              {countdown && (
                <>
                  {" · "}
                  <WeeklyCountdown target={countdown.target.toISOString()} prefix={countdown.prefix} />
                </>
              )}
            </p>
            <p className="mt-0.5 text-xs text-muted">90 min · 3 problems · a fixed slot keeps you honest.</p>
          </div>
        </div>

        <div className="shrink-0">
          {weekly ? (
            <Link
              href={`/contests/${weekly.id}`}
              className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-medium hover:bg-accent/15"
            >
              {weekly.live ? "Resume →" : "Review →"}
            </Link>
          ) : startable ? (
            <form action={createContest.bind(null, "WEEKLY")}>
              <button
                type="submit"
                className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90"
              >
                Start now
              </button>
            </form>
          ) : (
            <button
              type="button"
              disabled
              title={`Opens ${sch.label}`}
              className="cursor-not-allowed rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted opacity-60"
            >
              Locked
            </button>
          )}
        </div>
      </div>

      {/* Inline slot picker — make it your appointment. */}
      <form action={setWeeklySlot} className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-xs text-muted">
        <span>Change slot:</span>
        <select name="day" defaultValue={day} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-foreground">
          {DAY_NAMES.map((n, i) => (
            <option key={i} value={i}>{n}</option>
          ))}
        </select>
        <select name="hour" defaultValue={hour} className="rounded-md border border-border bg-surface-2 px-2 py-1 text-foreground">
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h}>{formatHour(h)}</option>
          ))}
        </select>
        <span>IST</span>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1 hover:bg-surface-2">
          Save
        </button>
      </form>
    </section>
  );
}

export default async function ContestsPage() {
  const user = await prisma.user.findFirst({
    select: { id: true, weeklyDay: true, weeklyHour: true },
  });

  // This week's weekly (if already started), for the appointment panel.
  let weekly: { id: string; live: boolean; startsAt: Date } | null = null;
  if (user) {
    const sch = weeklySchedule(user.weeklyDay, user.weeklyHour);
    const w = await prisma.contest.findFirst({
      where: { kind: "WEEKLY", startsAt: { gte: sch.thisSlot } },
      orderBy: { startsAt: "desc" },
      select: { id: true, startsAt: true, durationMin: true },
    });
    if (w) weekly = { id: w.id, startsAt: w.startsAt, live: contestTiming(w.startsAt, w.durationMin).live };
  }

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
      </div>

      {user && <WeeklyPanel day={user.weeklyDay} hour={user.weeklyHour} weekly={weekly} />}

      <div className="mt-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Or train any time</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
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
            No contests yet. Your weekly opens at its scheduled slot above.
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
