// CSES Problem Set adapter — https://cses.fi/problemset/
// CSES is the gold-standard structured set: ~400 problems in a fixed, ordered,
// topic-grouped sequence. We parse the public list (no API) and keep only
// metadata + deep-links. The CSES order IS the curated progression.

const CSES_URL = "https://cses.fi/problemset/";

export type CsesProblem = {
  externalId: string; // CSES task id
  title: string;
  section: string;
  order: number; // global order across the whole set (pedagogical sequence)
  url: string;
};

// CSES section -> our curriculum topic slug. Approximate but coherent; a CSES
// section becomes the spine of that topic's ladder.
export const CSES_SECTION_TO_TOPIC: Record<string, string> = {
  "Introductory Problems": "implementation",
  "Sorting and Searching": "binary-search",
  "Dynamic Programming": "dp-foundations",
  "Graph Algorithms": "graph-traversal",
  "Range Queries": "segment-tree",
  "Tree Algorithms": "trees-basics",
  Mathematics: "number-theory",
  "String Algorithms": "string-matching",
  Geometry: "geometry",
  "Advanced Techniques": "dp-optimization",
  "Sliding Window Problems": "sliding-window",
  "Interactive Problems": "binary-search",
  "Bitwise Operations": "bitmask-dp",
  "Construction Problems": "constructive",
  "Advanced Graph Problems": "scc",
  "Counting Problems": "combinatorics",
  // "Additional Problems I/II" intentionally unmapped (mixed practice).
};

export async function fetchCsesProblemset(): Promise<CsesProblem[]> {
  const res = await fetch(CSES_URL, { headers: { "User-Agent": "cp-academy/0.1" } });
  if (!res.ok) throw new Error(`CSES -> HTTP ${res.status}`);
  const html = await res.text();

  // Walk section headers and task links in document order.
  const re = /<h2[^>]*>([^<]+)<\/h2>|\/problemset\/task\/(\d+)"[^>]*>([^<]+)/g;
  const out: CsesProblem[] = [];
  const seen = new Set<string>();
  let section = "General";
  let order = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      section = m[1].trim();
    } else if (m[2]) {
      const id = m[2];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        externalId: id,
        title: m[3].trim(),
        section,
        order: order++,
        url: `https://cses.fi/problemset/task/${id}`,
      });
    }
  }
  return out;
}
