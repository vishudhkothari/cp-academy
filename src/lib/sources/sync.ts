import type { PrismaClient } from "@prisma/client";
import {
  fetchProblemset,
  fetchContests,
  fetchUserStatus,
  fetchUserRating,
  cfExternalId,
  cfProblemUrl,
  pickTopicSlug,
  cfQuality,
  type CfContest,
} from "./codeforces";
import { fetchCsesProblemset, CSES_SECTION_TO_TOPIC } from "./cses";
import {
  fetchAtcoderProblems,
  fetchAtcoderDifficulties,
  fetchAtcoderUserStatus,
  atExternalId,
  atProblemUrl,
  atQuality,
} from "./atcoder";

// ── Codeforces problemset → catalog (metadata + topic mapping + solve count) ──
export async function syncCodeforcesProblems(prisma: PrismaClient) {
  const topics = await prisma.topic.findMany({
    select: { id: true, slug: true, month: true },
  });
  const monthBySlug: Record<string, number> = {};
  const idBySlug: Record<string, string> = {};
  for (const t of topics) {
    monthBySlug[t.slug] = t.month;
    idBySlug[t.slug] = t.id;
  }

  // Contest metadata (name + start time) drives the curation quality score, so a
  // problem's source round and era count — not just how many people solved it.
  const contestById = new Map<number, CfContest>();
  try {
    for (const c of await fetchContests()) contestById.set(c.id, c);
  } catch {
    // contest.list is best-effort; quality degrades gracefully to popularity.
  }

  const problems = await fetchProblemset();
  const rows = problems.map((p) => {
    const slug = pickTopicSlug(p.tags, monthBySlug);
    const contest = p.contestId != null ? contestById.get(p.contestId) : undefined;
    return {
      source: "CODEFORCES" as const,
      externalId: cfExternalId(p),
      title: p.name,
      url: cfProblemUrl(p),
      sourceRating: p.rating ?? null,
      sourceTags: p.tags,
      solvedCount: p.solvedCount ?? null,
      quality: cfQuality(p.solvedCount, contest),
      topicId: slug ? idBySlug[slug] : null,
      syncedAt: new Date(),
    };
  });

  let created = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await prisma.problem.createMany({
      data: rows.slice(i, i + 1000),
      skipDuplicates: true,
    });
    created += r.count;
  }

  // Backfill solveCount + quality on already-existing rows (bulk per chunk).
  const withCount = rows.filter((r) => r.solvedCount != null);
  for (let i = 0; i < withCount.length; i += 2000) {
    const values = withCount
      .slice(i, i + 2000)
      .map((r) => `('${r.externalId}',${r.solvedCount},${r.quality})`)
      .join(",");
    await prisma.$executeRawUnsafe(
      `UPDATE "Problem" AS p SET "solvedCount" = v.sc, "quality" = v.q
       FROM (VALUES ${values}) AS v(eid, sc, q)
       WHERE p."externalId" = v.eid AND p.source = 'CODEFORCES'`,
    );
  }
  return { fetched: rows.length, created };
}

// ── CSES problem set → catalog (the canonical ordered spine) ──────────────────
export async function syncCsesProblems(prisma: PrismaClient) {
  const topics = await prisma.topic.findMany({ select: { id: true, slug: true } });
  const idBySlug: Record<string, string> = {};
  for (const t of topics) idBySlug[t.slug] = t.id;

  const problems = await fetchCsesProblemset();
  const rows = problems.map((p) => {
    const slug = CSES_SECTION_TO_TOPIC[p.section];
    return {
      source: "CSES" as const,
      externalId: p.externalId,
      title: p.title,
      url: p.url,
      csesSection: p.section,
      topicId: slug ? idBySlug[slug] : null,
      syncedAt: new Date(),
    };
  });
  const r = await prisma.problem.createMany({ data: rows, skipDuplicates: true });
  return { fetched: rows.length, created: r.count };
}

// ── AtCoder problemset → catalog (metadata + difficulty as sourceRating) ──────
// AtCoder has no tags, so problems land untopiced; difficulty (where modeled)
// becomes sourceRating. They still flow through the catalog, contests, and the
// readiness "hardest solve" signal.
export async function syncAtcoderProblems(prisma: PrismaClient) {
  const [problems, difficulties] = await Promise.all([
    fetchAtcoderProblems(),
    fetchAtcoderDifficulties().catch(() => ({}) as Record<string, number>),
  ]);
  const rows = problems.map((p) => ({
    source: "ATCODER" as const,
    externalId: atExternalId(p),
    title: p.title || p.name,
    url: atProblemUrl(p),
    sourceRating: difficulties[p.id] ?? null,
    quality: atQuality(p.contest_id, difficulties[p.id] != null),
    sourceTags: [] as string[],
    syncedAt: new Date(),
  }));

  let created = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await prisma.problem.createMany({
      data: rows.slice(i, i + 1000),
      skipDuplicates: true,
    });
    created += r.count;
  }

  // Backfill difficulty + quality onto existing rows (bulk). quality is always
  // set; sourceRating may be null (unmodeled problems) → emit SQL NULL.
  for (let i = 0; i < rows.length; i += 2000) {
    const values = rows
      .slice(i, i + 2000)
      .map((r) => `('${r.externalId}',${r.sourceRating ?? "NULL"},${r.quality})`)
      .join(",");
    await prisma.$executeRawUnsafe(
      `UPDATE "Problem" AS p SET "sourceRating" = v.r::int, "quality" = v.q::double precision
       FROM (VALUES ${values}) AS v(eid, r, q)
       WHERE p."externalId" = v.eid AND p.source = 'ATCODER'`,
    );
  }
  return { fetched: rows.length, created };
}

// ── Your AtCoder solves (authoritative verdicts) ──────────────────────────────
export async function syncAtcoderUser(
  prisma: PrismaClient,
  userId: string,
  handle: string,
) {
  const subs = await fetchAtcoderUserStatus(handle);
  const solvedAt = new Map<string, number>();
  for (const s of subs) {
    if (s.result !== "AC") continue;
    const prev = solvedAt.get(s.problem_id);
    if (prev === undefined || s.epoch_second < prev) solvedAt.set(s.problem_id, s.epoch_second);
  }

  const known = await prisma.problem.findMany({
    where: { source: "ATCODER", externalId: { in: [...solvedAt.keys()] } },
    select: { id: true, externalId: true },
  });

  let recorded = 0;
  const recordedProblemIds: string[] = [];
  for (const p of known) {
    const ts = solvedAt.get(p.externalId)!;
    const existing = await prisma.submission.findFirst({
      where: { userId, problemId: p.id, origin: "OJ_SYNCED", verdict: "AC" },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.submission.create({
      data: {
        userId,
        problemId: p.id,
        language: "CPP",
        source: "",
        verdict: "AC",
        origin: "OJ_SYNCED",
        createdAt: new Date(ts * 1000),
      },
    });
    recorded++;
    recordedProblemIds.push(p.id);
  }
  return { solved: known.length, recorded, recordedProblemIds };
}

// ── Curated ladders: the answer to "what do I solve next?" ────────────────────
// Each topic gets a coherent, full-coverage ladder built from the best sources:
//   1. CSES core   — the gold-standard, hand-ordered canonical set.
//   2. AtCoder EDU — the Educational DP Contest (dp_a…dp_z), the canonical way to
//                    learn DP, attached to the DP foundations topic.
//   3. Codeforces  — a difficulty RAMP inside a band that RISES with the month,
//                    so early topics stay near the base while later ones push
//                    toward Candidate Master. Deduped globally so coarse tags
//                    ("dp", "data structures") spread across the topics that use
//                    them instead of one topic hogging everything.
//
// The rising BAND (floor + cap, not just a cap) is the key quality fix: a
// Month-8 topic should never serve 800-rated problems.
function bandForMonth(month: number): { floor: number; cap: number } {
  const cap = Math.min(2400, 1000 + month * 120);
  const floor = Math.max(800, cap - 500);
  return { floor, cap };
}

const CSES_CAP = 12;
const CF_CAP = 14;
const CF_PER_BUCKET = 3; // depth per 100-rating step (CP-31-style volume)

// The DP foundations topic receives the AtCoder Educational DP Contest.
const EDU_DP_TOPIC = "dp-foundations";

export async function generateCuratedProblems(prisma: PrismaClient) {
  const topics = await prisma.topic.findMany({
    orderBy: [{ month: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, month: true, cfTags: true },
  });

  const cses = await fetchCsesProblemset();
  const csesOrder = new Map<string, number>();
  for (const c of cses) csesOrder.set(c.externalId, c.order);

  await prisma.curatedProblem.deleteMany({});

  const usedCF = new Set<string>();
  let total = 0;
  for (const topic of topics) {
    const { floor, cap } = bandForMonth(topic.month);
    const items: {
      topicId: string;
      problemId: string;
      order: number;
      tier: string;
      kind: string;
    }[] = [];
    let order = 0;

    // 1) CSES core, canonical order, capped.
    const csesProbs = await prisma.problem.findMany({
      where: { source: "CSES", topicId: topic.id },
      select: { id: true, externalId: true },
    });
    csesProbs.sort(
      (a, b) =>
        (csesOrder.get(a.externalId) ?? 1e9) - (csesOrder.get(b.externalId) ?? 1e9),
    );
    for (const p of csesProbs.slice(0, CSES_CAP)) {
      items.push({ topicId: topic.id, problemId: p.id, order: order++, tier: "core", kind: "cses" });
    }

    // 2) AtCoder Educational DP Contest (dp_a…dp_z, in order) for DP foundations.
    if (topic.slug === EDU_DP_TOPIC) {
      const eduDp = await prisma.problem.findMany({
        where: { source: "ATCODER", externalId: { startsWith: "dp_" } },
        select: { id: true, externalId: true },
      });
      eduDp.sort((a, b) => a.externalId.localeCompare(b.externalId));
      for (const p of eduDp) {
        items.push({ topicId: topic.id, problemId: p.id, order: order++, tier: "core", kind: "atcoder-dp" });
      }
    }

    // 3) Codeforces ramp inside the month's RISING band — top-N most-solved per
    //    100-rating bucket (depth + quality), deduped globally, capped.
    if (topic.cfTags.length) {
      const cfProbs = await prisma.problem.findMany({
        where: {
          source: "CODEFORCES",
          sourceTags: { hasSome: topic.cfTags },
          sourceRating: { gte: floor, lte: cap },
        },
        select: { id: true, sourceRating: true, quality: true },
      });
      const buckets = new Map<number, typeof cfProbs>();
      for (const p of cfProbs) {
        if (usedCF.has(p.id)) continue;
        const b = Math.floor((p.sourceRating ?? 0) / 100) * 100;
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b)!.push(p);
      }
      const ramp: typeof cfProbs = [];
      for (const b of [...buckets.keys()].sort((a, z) => a - z)) {
        // Best-quality problems per rating step (not just most-solved).
        const top = buckets
          .get(b)!
          .sort((a, z) => (z.quality ?? 0) - (a.quality ?? 0))
          .slice(0, CF_PER_BUCKET);
        ramp.push(...top);
      }
      const span = Math.max(1, cap - floor);
      for (const p of ramp.slice(0, CF_CAP)) {
        const r = p.sourceRating ?? floor;
        const frac = (r - floor) / span;
        const tier = frac <= 0.5 ? "core" : frac <= 0.8 ? "extra" : "challenge";
        items.push({ topicId: topic.id, problemId: p.id, order: order++, tier, kind: "cf-ladder" });
        usedCF.add(p.id);
      }
    }

    if (items.length) {
      await prisma.curatedProblem.createMany({ data: items, skipDuplicates: true });
      total += items.length;
    }
  }
  return { topics: topics.length, curated: total };
}

// ── Your Codeforces solves (authoritative verdicts) + rating history ──────────
export async function syncCodeforcesUser(
  prisma: PrismaClient,
  userId: string,
  handle: string,
) {
  const subs = await fetchUserStatus(handle);
  const solvedAt = new Map<string, number>();
  for (const s of subs) {
    if (s.verdict !== "OK" || !s.problem.contestId) continue;
    const ext = cfExternalId(s.problem);
    const prev = solvedAt.get(ext);
    if (prev === undefined || s.creationTimeSeconds < prev)
      solvedAt.set(ext, s.creationTimeSeconds);
  }

  const known = await prisma.problem.findMany({
    where: { source: "CODEFORCES", externalId: { in: [...solvedAt.keys()] } },
    select: { id: true, externalId: true },
  });

  let recorded = 0;
  const recordedProblemIds: string[] = [];
  for (const p of known) {
    const ts = solvedAt.get(p.externalId)!;
    const existing = await prisma.submission.findFirst({
      where: { userId, problemId: p.id, origin: "OJ_SYNCED", verdict: "AC" },
      select: { id: true },
    });
    if (existing) continue;
    await prisma.submission.create({
      data: {
        userId,
        problemId: p.id,
        language: "CPP",
        source: "",
        verdict: "AC",
        origin: "OJ_SYNCED",
        createdAt: new Date(ts * 1000),
      },
    });
    recorded++;
    recordedProblemIds.push(p.id);
  }

  const ratings = await fetchUserRating(handle);
  let snapshots = 0;
  for (const r of ratings) {
    const takenAt = new Date(r.ratingUpdateTimeSeconds * 1000);
    const exists = await prisma.ratingSnapshot.findFirst({
      where: { userId, kind: "CF_REAL", takenAt },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.ratingSnapshot.create({
      data: { userId, kind: "CF_REAL", value: r.newRating, takenAt },
    });
    snapshots++;
  }
  return { solved: known.length, recorded, snapshots, recordedProblemIds };
}
