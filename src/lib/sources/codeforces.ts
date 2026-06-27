// Codeforces source adapter. Official API — https://codeforces.com/apiHelp
// We store only metadata + our annotations and deep-link to the real statement.

const CF_API = "https://codeforces.com/api";

export type CfProblem = {
  contestId?: number;
  index: string;
  name: string;
  type: string;
  rating?: number;
  tags: string[];
  solvedCount?: number;
};

export type CfSubmission = {
  problem: { contestId?: number; index: string; name: string };
  verdict?: string;
  creationTimeSeconds: number;
  programmingLanguage: string;
};

export type CfRatingChange = {
  newRating: number;
  ratingUpdateTimeSeconds: number;
};

// Canonical Codeforces-tag -> our topic slug. Deliberately one-to-one so the
// sync can auto-file problems; the user refines tags manually afterward.
export const CF_TAG_TO_TOPIC: Record<string, string> = {
  implementation: "implementation",
  "brute force": "implementation",
  interactive: "implementation",
  sortings: "sortings",
  "two pointers": "two-pointers",
  "binary search": "binary-search",
  "ternary search": "binary-search",
  hashing: "hashing",
  "dfs and similar": "graph-traversal",
  graphs: "graph-traversal",
  "shortest paths": "shortest-paths",
  dsu: "dsu",
  trees: "trees-basics",
  dp: "dp-foundations",
  greedy: "greedy",
  "constructive algorithms": "constructive",
  "graph matchings": "matching",
  "data structures": "segment-tree",
  bitmasks: "bitmask-dp",
  strings: "string-matching",
  "string suffix structures": "string-matching",
  "number theory": "number-theory",
  math: "combinatorics",
  combinatorics: "combinatorics",
  probabilities: "expected-value",
  geometry: "geometry",
  games: "game-theory",
  flows: "flows",
  "divide and conquer": "dp-optimization",
  fft: "number-theory",
  matrices: "number-theory",
};

export type CfContest = {
  id: number;
  name: string;
  phase: string;
  startTimeSeconds?: number;
};

async function cfFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${CF_API}/${path}`, {
    headers: { "User-Agent": "cp-academy/0.1" },
  });
  if (!res.ok) throw new Error(`Codeforces ${path} -> HTTP ${res.status}`);
  const json = (await res.json()) as { status: string; result: T; comment?: string };
  if (json.status !== "OK") throw new Error(`Codeforces ${path} -> ${json.comment}`);
  return json.result;
}

export async function fetchProblemset(): Promise<CfProblem[]> {
  const result = await cfFetch<{
    problems: CfProblem[];
    problemStatistics: { contestId?: number; index: string; solvedCount: number }[];
  }>("problemset.problems");
  const solved = new Map<string, number>();
  for (const s of result.problemStatistics) {
    solved.set(`${s.contestId}/${s.index}`, s.solvedCount);
  }
  // Only problems attached to a contest have a stable public URL.
  return result.problems
    .filter((p) => p.contestId)
    .map((p) => ({ ...p, solvedCount: solved.get(`${p.contestId}/${p.index}`) }));
}

export async function fetchUserStatus(handle: string): Promise<CfSubmission[]> {
  return cfFetch<CfSubmission[]>(`user.status?handle=${encodeURIComponent(handle)}`);
}

export async function fetchUserRating(handle: string): Promise<CfRatingChange[]> {
  return cfFetch<CfRatingChange[]>(`user.rating?handle=${encodeURIComponent(handle)}`);
}

export async function fetchContests(): Promise<CfContest[]> {
  return cfFetch<CfContest[]>("contest.list");
}

// Contest-type weight: prefer rounds *designed* to teach the target level.
// Educational rounds and Div. 3/4 have clean editorials and standard techniques;
// novelty rounds (April Fools, Kotlin) make poor curriculum.
export function cfContestTypeWeight(name: string): number {
  const n = name.toLowerCase();
  if (n.includes("educational")) return 1.25;
  if (/div\.?\s*4/.test(n)) return 1.18;
  if (/div\.?\s*3/.test(n)) return 1.12;
  if (n.includes("global")) return 1.08;
  if (/div\.?\s*2/.test(n)) return 1.0;
  if (/div\.?\s*1/.test(n)) return 0.95;
  if (n.includes("april fools") || n.includes("kotlin") || n.includes("q#") || n.includes("unrated"))
    return 0.5;
  return 0.85; // other rated rounds
}

// Recency tilt: modern problems better reflect what the learner will face, and
// are generally higher quality — without erasing the classics entirely.
export function cfEraWeight(startTimeSeconds?: number): number {
  if (!startTimeSeconds) return 0.8;
  const year = new Date(startTimeSeconds * 1000).getFullYear();
  if (year >= 2021) return 1.0;
  if (year >= 2018) return 0.92;
  if (year >= 2015) return 0.82;
  return 0.65;
}

// Composite curation quality (~0..1.3). Replaces raw solve count: popularity is
// log-damped (so a trivial 100k-solve problem can't bury a 3k-solve gem), then
// weighted by how good the source round is for learning and how modern it is.
export function cfQuality(solvedCount: number | undefined, contest?: CfContest): number {
  const s = solvedCount ?? 0;
  const popularity = s > 0 ? Math.min(1, Math.log10(s) / 5) : 0; // 100k solves ≈ 1.0
  const type = contest ? cfContestTypeWeight(contest.name) : 0.85;
  const era = cfEraWeight(contest?.startTimeSeconds);
  return popularity * type * era;
}

export function cfContestIdOf(externalId: string): number {
  return parseInt(externalId.split("/")[0], 10);
}

export function cfExternalId(p: { contestId?: number; index: string }): string {
  return `${p.contestId}/${p.index}`;
}

export function cfProblemUrl(p: { contestId?: number; index: string }): string {
  return `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
}

export function cfVerdictToOurs(v?: string):
  | "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "PENDING" {
  switch (v) {
    case "OK": return "AC";
    case "WRONG_ANSWER": return "WA";
    case "TIME_LIMIT_EXCEEDED": return "TLE";
    case "MEMORY_LIMIT_EXCEEDED": return "MLE";
    case "RUNTIME_ERROR": return "RE";
    case "COMPILATION_ERROR": return "CE";
    case "TESTING": case undefined: return "PENDING";
    default: return "WA";
  }
}

// Choose the topic for a problem: among matched tags, prefer the most advanced
// (highest curriculum month) — that's usually the concept the problem demands.
export function pickTopicSlug(
  tags: string[],
  monthBySlug: Record<string, number>,
): string | null {
  let best: { slug: string; month: number } | null = null;
  for (const tag of tags) {
    const slug = CF_TAG_TO_TOPIC[tag];
    if (!slug) continue;
    const month = monthBySlug[slug] ?? 0;
    if (!best || month > best.month) best = { slug, month };
  }
  return best?.slug ?? null;
}
