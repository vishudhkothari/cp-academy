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
