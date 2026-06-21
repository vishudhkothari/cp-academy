import type { PrismaClient } from "@prisma/client";

// The observant coach: transparent, rule-based recommendations derived from your
// actual data — contest readiness (and "basics first" when you're not ready),
// weak axes, skipped-basics gaps, and recurring mistake patterns.

export type Insight = {
  tone: "ready" | "basics" | "start" | "weak" | "pattern";
  title: string;
  body: string;
  action?: { label: string; href: string; external?: boolean };
};

const FAIL_LABEL: Record<string, string> = {
  OBSERVATION: "reducing problems (observation)",
  TECHNIQUE: "not knowing the technique",
  IMPLEMENTATION: "implementing the idea",
  DEBUG: "debugging",
  TIME: "time pressure",
  CARELESS: "careless mistakes",
};

const BUG_FIX: Record<string, string> = {
  OVERFLOW: "default to 64-bit ints (`#define int long long`) and watch your bounds.",
  OFF_BY_ONE: "write the loop bounds and indices out explicitly before you code.",
  TYPO: "slow down, re-read, and lean on a consistent template.",
  LOGIC: "trace one sample by hand before you submit.",
  WRONG_OBSERVATION: "prove or stress-test your idea before coding it.",
  COMPLEXITY: "estimate the time complexity against the constraints first.",
  EDGE_CASE: "list n=0, n=1, and the max case before coding.",
  OTHER: "add it to a pre-submit checklist.",
};

export async function getCoachInsights(
  prisma: PrismaClient,
  userId: string,
): Promise<Insight[]> {
  const [solved, reflections, coach] = await Promise.all([
    prisma.submission.findMany({
      where: { userId, verdict: "AC" },
      distinct: ["problemId"],
      select: {
        problem: { select: { sourceRating: true, topic: { select: { month: true } } } },
      },
    }),
    prisma.reflection.findMany({
      where: { userId },
      select: { failReason: true, bugType: true },
    }),
    prisma.coachUsage.findMany({
      where: { userId, maxLevel: { gt: 0 } },
      select: { maxLevel: true },
    }),
  ]);

  const insights: Insight[] = [];
  const n = solved.length;
  const ratings = solved.map((s) => s.problem.sourceRating ?? 0).filter((r) => r > 0);
  const maxRating = ratings.length ? Math.max(...ratings) : 0;
  const atLeast = (r: number) => ratings.filter((x) => x >= r).length;

  // ── Readiness (and basics-first when not ready) ──────────────────────────
  if (n === 0) {
    insights.push({
      tone: "start",
      title: "Start with the fundamentals",
      body: "You haven't solved anything yet. Open your Path and begin at Month 1 — don't jump to contests, build the base first.",
      action: { label: "Open the Path", href: "/learn" },
    });
  } else if (n < 15 || maxRating < 1000) {
    insights.push({
      tone: "basics",
      title: "Keep building your base — not contest-ready yet",
      body: `You've solved ${n}${maxRating ? ` (top rating ${maxRating})` : ""}. Get to roughly 20 solves around 1000-rated before a rated contest; stay on Months 1–2 for now.`,
      action: { label: "Continue the Path", href: "/learn" },
    });
  } else {
    const band =
      maxRating >= 1500 && atLeast(1400) >= 5
        ? "Div 2"
        : maxRating >= 1300 && atLeast(1200) >= 5
          ? "Div 3"
          : "Div 4 / AtCoder ABC";
    insights.push({
      tone: "ready",
      title: `You're ready for Codeforces ${band}`,
      body: `You're solving up to ${maxRating}-rated problems. Time to test it under real time pressure — rated contests are low-stakes and build exactly the experience the curriculum is after.`,
      action: { label: "Go to Codeforces", href: "https://codeforces.com/contests", external: true },
    });
  }

  // ── Skipped-basics gap ───────────────────────────────────────────────────
  const months = new Set(
    solved.map((s) => s.problem.topic?.month).filter((m): m is number => Boolean(m)),
  );
  const maxMonth = months.size ? Math.max(...months) : 0;
  if (maxMonth >= 4) {
    const gap = [...Array(maxMonth).keys()].map((i) => i + 1).find((m) => !months.has(m));
    if (gap)
      insights.push({
        tone: "basics",
        title: "Shore up a basics gap",
        body: `You've solved Month ${maxMonth} problems but nothing from Month ${gap}. Each month leans on the last — go back and fill that gap before pushing ahead.`,
        action: { label: "Open the Path", href: "/learn" },
      });
  }

  // ── Weakest axis (from reflections) ──────────────────────────────────────
  const failCounts: Record<string, number> = {};
  for (const r of reflections) if (r.failReason) failCounts[r.failReason] = (failCounts[r.failReason] ?? 0) + 1;
  const topFail = Object.entries(failCounts).sort((a, b) => b[1] - a[1])[0];
  if (topFail && topFail[1] >= 2) {
    insights.push({
      tone: "weak",
      title: `Your bottleneck is ${FAIL_LABEL[topFail[0]] ?? topFail[0]}`,
      body: `It's the most common reason you get stuck (${topFail[1]}×). That's the axis to train — pick problems that stress it specifically rather than ones you already find easy.`,
      action: { label: "See analytics", href: "/analytics" },
    });
  }

  // ── Recurring mistake pattern (bug types) ────────────────────────────────
  const bugCounts: Record<string, number> = {};
  for (const r of reflections) if (r.bugType) bugCounts[r.bugType] = (bugCounts[r.bugType] ?? 0) + 1;
  const topBug = Object.entries(bugCounts).sort((a, b) => b[1] - a[1])[0];
  if (topBug && topBug[1] >= 2) {
    insights.push({
      tone: "pattern",
      title: `Recurring mistake: ${topBug[0].toLowerCase().replace(/_/g, " ")}`,
      body: `You've logged this ${topBug[1]}× — that's a pattern, not bad luck. Fix: ${BUG_FIX[topBug[0]] ?? BUG_FIX.OTHER}`,
      action: { label: "Add to your reference", href: "/reference" },
    });
  }

  // ── Over-reliance on hints ───────────────────────────────────────────────
  const heavyHints = coach.filter((c) => c.maxLevel >= 4).length;
  if (heavyHints >= 3) {
    insights.push({
      tone: "pattern",
      title: "You're reaching for solutions early",
      body: `You went to Approach/Editorial level on ${heavyHints} problems. Sit with the lower hint rungs longer — the struggle before the hint is where observation skill actually grows.`,
    });
  }

  return insights;
}
