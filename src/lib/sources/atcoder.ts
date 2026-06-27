// AtCoder source adapter via the community AtCoder Problems API
// (https://github.com/kenkoooo/AtCoderProblems) — AtCoder has no official
// problem/rating API. We store only metadata + deep-link to the real statement,
// consistent with the CF adapter. Difficulty (where modeled) becomes sourceRating.
//
// Be polite: this is a community service. We make a handful of calls per sync and
// cache results in our own DB.

const RESOURCES = "https://kenkoooo.com/atcoder/resources";
const API_V3 = "https://kenkoooo.com/atcoder/atcoder-api/v3";

export type AtProblem = {
  id: string; // e.g. "abc086_a"
  contest_id: string; // e.g. "abc086"
  problem_index: string; // e.g. "A"
  name: string;
  title: string;
};

export type AtSubmission = {
  id: number;
  epoch_second: number;
  problem_id: string;
  contest_id: string;
  result: string; // "AC", "WA", "TLE", ...
};

async function atFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "cp-academy/0.1" } });
  if (!res.ok) throw new Error(`AtCoder Problems ${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchAtcoderProblems(): Promise<AtProblem[]> {
  return atFetch<AtProblem[]>(`${RESOURCES}/problems.json`);
}

// problemId -> estimated difficulty (Elo-like). Many problems are unmodeled.
export async function fetchAtcoderDifficulties(): Promise<Record<string, number>> {
  const models = await atFetch<Record<string, { difficulty?: number }>>(
    `${RESOURCES}/problem-models.json`,
  );
  const out: Record<string, number> = {};
  for (const [id, m] of Object.entries(models)) {
    if (typeof m.difficulty === "number") {
      // AtCoder Problems clamps low difficulties with a smoothing curve; we just
      // floor at 0 and round to keep it comparable to CF ratings.
      out[id] = Math.max(0, Math.round(m.difficulty));
    }
  }
  return out;
}

export async function fetchAtcoderUserStatus(handle: string): Promise<AtSubmission[]> {
  return atFetch<AtSubmission[]>(
    `${API_V3}/user/submissions?user=${encodeURIComponent(handle)}&from_second=0`,
  );
}

export function atExternalId(p: { id: string }): string {
  return p.id;
}

export function atProblemUrl(p: { contest_id: string; id: string }): string {
  return `https://atcoder.jp/contests/${p.contest_id}/tasks/${p.id}`;
}

export function atVerdictToOurs(v?: string):
  | "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "PENDING" {
  switch (v) {
    case "AC": return "AC";
    case "WA": return "WA";
    case "TLE": return "TLE";
    case "MLE": return "MLE";
    case "RE": return "RE";
    case "CE": return "CE";
    case "WJ": case "WR": case undefined: return "PENDING";
    default: return "WA";
  }
}
