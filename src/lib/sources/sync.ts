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

// ── Curated ladders: the answer to "what do I solve next?" ────────────────────
// Per topic: CSES problems first (canonical order), then a Codeforces ladder
// (a difficulty ramp using the most-solved = most representative problems).
function capForMonth(month: number): number {
  return Math.min(2600, 1000 + month * 130);
}

export async function generateCuratedProblems(prisma: PrismaClient) {
  const topics = await prisma.topic.findMany({
    select: { id: true, slug: true, month: true },
  });

  // CSES global order (for sequencing CSES problems within a topic).
  const cses = await fetchCsesProblemset();
  const csesOrder = new Map<string, number>();
  for (const c of cses) csesOrder.set(c.externalId, c.order);

  await prisma.curatedProblem.deleteMany({});

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

    // 1) CSES core, in canonical order.
    const csesProbs = await prisma.problem.findMany({
      where: { source: "CSES", topicId: topic.id },
      select: { id: true, externalId: true },
    });
    csesProbs.sort(
      (a, b) =>
        (csesOrder.get(a.externalId) ?? 1e9) - (csesOrder.get(b.externalId) ?? 1e9),
    );
    for (const p of csesProbs) {
      items.push({ topicId: topic.id, problemId: p.id, order: order++, tier: "core", kind: "cses" });
    }

    // 2) Codeforces ladder — top-3 most-solved per 100-rating bucket up to the cap.
    const cfProbs = await prisma.problem.findMany({
      where: {
        source: "CODEFORCES",
        topicId: topic.id,
        sourceRating: { gte: 800, lte: cap },
      },
      select: { id: true, sourceRating: true, solvedCount: true },
    });
    const buckets = new Map<number, typeof cfProbs>();
    for (const p of cfProbs) {
      const b = Math.floor((p.sourceRating ?? 0) / 100) * 100;
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b)!.push(p);
    }
    const ladder: typeof cfProbs = [];
    for (const b of [...buckets.keys()].sort((a, z) => a - z)) {
      const top = buckets
        .get(b)!
        .sort((a, z) => (z.solvedCount ?? 0) - (a.solvedCount ?? 0))
        .slice(0, 3);
      ladder.push(...top);
    }
    for (const p of ladder) {
      const r = p.sourceRating ?? 0;
      const tier = r <= cap * 0.6 ? "core" : r <= cap * 0.85 ? "extra" : "challenge";
      items.push({ topicId: topic.id, problemId: p.id, order: order++, tier, kind: "cf-ladder" });
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
  return { solved: known.length, recorded, snapshots };
}
