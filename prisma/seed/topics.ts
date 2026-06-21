// Curriculum topic taxonomy — see docs/03-CURRICULUM.md.
// `lean` drives contest balance (observation- vs technique-heavy, paper §5.1).
// `cfTags` maps Codeforces problem tags onto our topics so the sync can
// auto-categorize. `prereqs` are SOFT (the schedule is a web, not a hierarchy).

export type AxisLean = "OBSERVATION_HEAVY" | "TECHNIQUE_HEAVY" | "MIXED";

export type SeedTopic = {
  slug: string;
  name: string;
  month: number;
  lean: AxisLean;
  cfTags?: string[];
  prereqs?: string[];
  description?: string;
};

export const topics: SeedTopic[] = [
  // ── Month 1 — C++ & implementation foundation ──────────────────────────────
  { slug: "implementation", name: "Implementation & Simulation", month: 1, lean: "TECHNIQUE_HEAVY", cfTags: ["implementation", "brute force"], description: "Translate logic to clean, correct code; simulation problems." },
  { slug: "complexity", name: "Complexity Analysis", month: 1, lean: "MIXED", description: "Big-O, constant factors, estimating limits from constraints." },
  { slug: "sortings", name: "Sorting", month: 1, lean: "MIXED", cfTags: ["sortings"] },
  { slug: "prefix-sums", name: "Prefix Sums & Difference Arrays", month: 1, lean: "OBSERVATION_HEAVY", cfTags: ["dp"], description: "Range-query thinking introduced early (paper rule #2)." },
  { slug: "two-pointers", name: "Two Pointers", month: 1, lean: "OBSERVATION_HEAVY", cfTags: ["two pointers"] },

  // ── Month 2 — searching & basic structures ─────────────────────────────────
  { slug: "binary-search", name: "Binary Search & BSTA", month: 2, lean: "OBSERVATION_HEAVY", cfTags: ["binary search", "ternary search"], prereqs: ["sortings"], description: "Binary search on answer is a core observation multiplier." },
  { slug: "hashing", name: "Hashing", month: 2, lean: "TECHNIQUE_HEAVY", cfTags: ["hashing"] },
  { slug: "stacks-queues", name: "Stacks, Queues & Monotonic Stack", month: 2, lean: "MIXED", cfTags: ["data structures"] },
  { slug: "fenwick", name: "Fenwick Tree (BIT)", month: 2, lean: "TECHNIQUE_HEAVY", cfTags: ["data structures"], prereqs: ["prefix-sums"] },

  // ── Month 3 — recursion, trees, range queries ──────────────────────────────
  { slug: "recursion", name: "Recursion & Backtracking", month: 3, lean: "MIXED", cfTags: ["brute force", "dfs and similar"] },
  { slug: "trees-basics", name: "Trees: Basics & Traversal", month: 3, lean: "TECHNIQUE_HEAVY", cfTags: ["trees"] },
  { slug: "sparse-table", name: "Sparse Table / RMQ", month: 3, lean: "TECHNIQUE_HEAVY", cfTags: ["data structures"], prereqs: ["fenwick"] },
  { slug: "sliding-window", name: "Sliding Window", month: 3, lean: "OBSERVATION_HEAVY", cfTags: ["two pointers"], prereqs: ["two-pointers"] },

  // ── Month 4 — graph fundamentals ───────────────────────────────────────────
  { slug: "graph-traversal", name: "Graph Traversal (BFS/DFS/Floodfill)", month: 4, lean: "TECHNIQUE_HEAVY", cfTags: ["dfs and similar", "graphs"] },
  { slug: "topological-sort", name: "Topological Sort", month: 4, lean: "TECHNIQUE_HEAVY", cfTags: ["graphs"], prereqs: ["graph-traversal"] },
  { slug: "dsu", name: "Union-Find (DSU)", month: 4, lean: "TECHNIQUE_HEAVY", cfTags: ["dsu"] },
  { slug: "shortest-paths", name: "Shortest Paths", month: 4, lean: "TECHNIQUE_HEAVY", cfTags: ["shortest paths"], prereqs: ["graph-traversal"] },
  { slug: "mst", name: "Minimum Spanning Tree", month: 4, lean: "TECHNIQUE_HEAVY", cfTags: ["graphs", "dsu"], prereqs: ["dsu"] },

  // ── Month 5 — DP foundations ───────────────────────────────────────────────
  { slug: "dp-foundations", name: "DP Foundations", month: 5, lean: "OBSERVATION_HEAVY", cfTags: ["dp"] },
  { slug: "knapsack", name: "Knapsack Family", month: 5, lean: "OBSERVATION_HEAVY", cfTags: ["dp"], prereqs: ["dp-foundations"] },
  { slug: "lis", name: "LIS & Subsequences", month: 5, lean: "OBSERVATION_HEAVY", cfTags: ["dp", "binary search"], prereqs: ["dp-foundations"] },

  // ── Month 6 — greedy & ad-hoc observation ──────────────────────────────────
  { slug: "greedy", name: "Greedy & Exchange Argument", month: 6, lean: "OBSERVATION_HEAVY", cfTags: ["greedy"] },
  { slug: "constructive", name: "Constructive Algorithms", month: 6, lean: "OBSERVATION_HEAVY", cfTags: ["constructive algorithms"] },

  // ── Month 7 — advanced graphs ──────────────────────────────────────────────
  { slug: "scc", name: "SCC / Bridges / Articulation", month: 7, lean: "TECHNIQUE_HEAVY", cfTags: ["graphs", "dfs and similar"], prereqs: ["graph-traversal"] },
  { slug: "matching", name: "Bipartite Matching", month: 7, lean: "TECHNIQUE_HEAVY", cfTags: ["graph matchings"] },
  { slug: "lca", name: "LCA", month: 7, lean: "TECHNIQUE_HEAVY", cfTags: ["trees"], prereqs: ["trees-basics", "sparse-table"] },
  { slug: "tree-dp", name: "DP on Trees / Rerooting", month: 7, lean: "OBSERVATION_HEAVY", cfTags: ["dp", "trees"], prereqs: ["trees-basics", "dp-foundations"] },

  // ── Month 8 — range queries (full) & segment trees ─────────────────────────
  { slug: "segment-tree", name: "Segment Tree", month: 8, lean: "TECHNIQUE_HEAVY", cfTags: ["data structures"], prereqs: ["fenwick"] },
  { slug: "lazy-segment-tree", name: "Lazy Propagation", month: 8, lean: "TECHNIQUE_HEAVY", cfTags: ["data structures"], prereqs: ["segment-tree"] },
  { slug: "mos-algorithm", name: "Mo's Algorithm / Offline Queries", month: 8, lean: "OBSERVATION_HEAVY", cfTags: ["data structures"], prereqs: ["segment-tree"] },

  // ── Month 9 — advanced DP ──────────────────────────────────────────────────
  { slug: "bitmask-dp", name: "Bitmask DP", month: 9, lean: "OBSERVATION_HEAVY", cfTags: ["bitmasks", "dp"], prereqs: ["dp-foundations"] },
  { slug: "digit-dp", name: "Digit DP", month: 9, lean: "OBSERVATION_HEAVY", cfTags: ["dp"], prereqs: ["dp-foundations"] },
  { slug: "dp-optimization", name: "DP Optimizations", month: 9, lean: "OBSERVATION_HEAVY", cfTags: ["dp", "divide and conquer"], prereqs: ["dp-foundations"] },

  // ── Month 10 — strings & math ──────────────────────────────────────────────
  { slug: "string-matching", name: "String Matching (KMP / Z)", month: 10, lean: "TECHNIQUE_HEAVY", cfTags: ["strings"] },
  { slug: "tries", name: "Tries", month: 10, lean: "TECHNIQUE_HEAVY", cfTags: ["strings", "data structures"] },
  { slug: "modular-arithmetic", name: "Modular Arithmetic", month: 10, lean: "TECHNIQUE_HEAVY", cfTags: ["math", "number theory"] },
  { slug: "combinatorics", name: "Combinatorics & Inclusion-Exclusion", month: 10, lean: "OBSERVATION_HEAVY", cfTags: ["combinatorics", "math"] },
  { slug: "expected-value", name: "Probability & Expected Value", month: 10, lean: "OBSERVATION_HEAVY", cfTags: ["probabilities"] },

  // ── Month 11 — advanced / specialized ──────────────────────────────────────
  { slug: "number-theory", name: "Number Theory (ExGCD/CRT/Sieve)", month: 11, lean: "TECHNIQUE_HEAVY", cfTags: ["number theory", "math"] },
  { slug: "geometry", name: "Computational Geometry", month: 11, lean: "TECHNIQUE_HEAVY", cfTags: ["geometry"] },
  { slug: "game-theory", name: "Game Theory (Sprague-Grundy)", month: 11, lean: "OBSERVATION_HEAVY", cfTags: ["games"] },
  { slug: "flows", name: "Network Flows (interface)", month: 11, lean: "TECHNIQUE_HEAVY", cfTags: ["flows"], prereqs: ["graph-traversal"] },

  // ── Month 12 — synthesis & quant ───────────────────────────────────────────
  { slug: "contest-synthesis", name: "Contest & Interview Synthesis", month: 12, lean: "MIXED" },
  { slug: "quant-problems", name: "Quant Problem Solving", month: 12, lean: "OBSERVATION_HEAVY", cfTags: ["probabilities", "math", "combinatorics"], description: "Probability/EV/market-making interview problems (quant rail)." },
];
