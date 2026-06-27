import type { PrismaClient } from "@prisma/client";
import {
  fetchProblemset,
  fetchUserStatus,
  fetchUserRating,
  cfExternalId,
  cfProblemUrl,
  pickTopicSlug,
} from "./codeforces";
import { fetchCsesProblemset, CSES_SECTION_TO_TOPIC } from "./cses";
import {
  fetchAtcoderProblems,
  fetchAtcoderDifficulties,
  fetchAtcoderUserStatus,
  atExternalId,
  atProblemUrl,
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

  const problems = await fetchProblemset();
  const rows = problems.map((p) => {
    const slug = pickTopicSlug(p.tags, monthBySlug);
    return {
      source: "CODEFORCES" as const,
      externalId: cfExternalId(p),
      title: p.name,
      url: cfProblemUrl(p),
      sourceRating: p.rating ?? null,
      sourceTags: p.tags,
      solvedCount: p.solvedCount ?? null,
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

  // Backfill solveCount on already-existing rows (bulk, one statement per chunk).
  const withCount = rows.filter((r) => r.solvedCount != null);
  for (let i = 0; i < withCount.length; i += 2000) {
    const values = withCount
      .slice(i, i + 2000)
      .map((r) => `('${r.externalId}',${r.solvedCount})`)
      .join(",");
    await prisma.$executeRawUnsafe(
      `UPDATE "Problem" AS p SET "solvedCount" = v.sc
       FROM (VALUES ${values}) AS v(eid, sc)
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

  // Backfill difficulty onto existing rows (bulk).
  const withRating = rows.filter((r) => r.sourceRating != null);
  for (let i = 0; i < withRating.length; i += 2000) {
    const values = withRating
      .slice(i, i + 2000)
      .map((r) => `('${r.externalId}',${r.sourceRating})`)
      .join(",");
    await prisma.$executeRawUnsafe(
      `UPDATE "Problem" AS p SET "sourceRating" = v.r
       FROM (VALUES ${values}) AS v(eid, r)
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
// Tighter, full-coverage curation. Each topic gets a short hand-feeling ladder:
// CSES core (canonical order, capped) + a Codeforces ramp from the topic's tag
// pool. CF problems are deduped GLOBALLY in curriculum order, so coarse tags
// ("dp", "data structures") spread across the topics that use them — earlier
// topics get the easier ones, later topics the harder ones — instead of one
// topic hogging everything and the rest sitting empty.
function capForMonth(month: number): number {
  return Math.min(2500, 1000 + month * 130);
}

const CSES_CAP = 10;
const CF_CAP = 8;

export async function generateCuratedProblems(prisma: PrismaClient) {
  const topics = await prisma.topic.findMany({
    orderBy: [{ month: "asc" }, { name: "asc" }],
    select: { id: true, month: true, cfTags: true },
  });

  const cses = await fetchCsesProblemset();
  const csesOrder = new Map<string, number>();
  for (const c of cses) csesOrder.set(c.externalId, c.order);

  await prisma.curatedProblem.deleteMany({});

  const usedCF = new Set<string>();
  let total = 0;
  for (const topic of topics) {
    const cap = capForMonth(topic.month);
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

    // 2) Codeforces ramp from the topic's tag pool — top-2 most-solved per
    //    100-rating bucket, deduped globally, capped.
    if (topic.cfTags.length) {
      const cfProbs = await prisma.problem.findMany({
        where: {
          source: "CODEFORCES",
          sourceTags: { hasSome: topic.cfTags },
          sourceRating: { gte: 800, lte: cap },
        },
        select: { id: true, sourceRating: true, solvedCount: true },
      });
      const buckets = new Map<number, typeof cfProbs>();
      for (const p of cfProbs) {
        if (usedCF.has(p.id)) continue;
        const b = Math.floor((p.sourceRating ?? 0) / 100) * 100;
        if (!buckets.has(b)) buckets.set(b, []);
        buckets.get(b)!.push(p);
      }
      const ladder: typeof cfProbs = [];
      for (const b of [...buckets.keys()].sort((a, z) => a - z)) {
        const top = buckets
          .get(b)!
          .sort((a, z) => (z.solvedCount ?? 0) - (a.solvedCount ?? 0))
          .slice(0, 2);
        ladder.push(...top);
      }
      for (const p of ladder.slice(0, CF_CAP)) {
        const r = p.sourceRating ?? 0;
        const tier = r <= cap * 0.6 ? "core" : r <= cap * 0.85 ? "extra" : "challenge";
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
