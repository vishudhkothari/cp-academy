# 03 — Curriculum Architecture

Your month-by-month plan is a sound **foundation ramp** (you're ~50 LeetCode problems in and need a C++/STL refresher — the paper assumes that foundation is already done and targets CP3). I'm keeping your skeleton but applying the paper's four sequencing rules and layering its *method* on top.

## 1. Sequencing rules (from paper §5.1)

1. **Implementation + complexity from Month 1** — implementation is the neglected axis; surface it immediately.
2. **Range-query *thinking* early, interlaced** — prefix sums / difference arrays in M1, Fenwick by M2–3, full segment trees later, then *reused* across topics rather than siloed in one month.
3. **Balance observation-heavy vs technique-heavy** topics so contests always have one of each.
4. **The schedule is a web, not a strict hierarchy** — prereqs are soft; revisit topics in spiral fashion.

Plus the cross-cutting method: **timed 3-problem contests from Week 1** (low-stakes), **upsolving graded over in-contest solving**, **one scaffold warm-up per topic**, **per-axis mastery gating** progression.

## 2. The 12-month roadmap (revised)

Legend — lean: 🟦 observation-heavy · 🟧 technique-heavy · 🟨 mixed

| Month | Focus | Key topics | Lean |
|------:|-------|-----------|------|
| **1** | C++ & implementation foundation | C++17 syntax refresher, STL (vector/map/set/priority_queue), I/O speed, complexity analysis, **prefix sums & difference arrays**, simulation/implementation problems, sorting, two pointers | 🟨🟧 |
| **2** | Searching & basic structures | **binary search + binary-search-the-answer (BSTA)**, hashing, stack/queue/deque, monotonic stack, linked-list patterns, **Fenwick (BIT) intro** | 🟨 |
| **3** | Recursion, trees, & range queries | recursion/backtracking, tree traversal & basics, **RMQ/sparse table**, more BIT applications, sliding window | 🟧🟦 |
| **4** | Graph fundamentals | BFS/DFS, flood fill, topological sort, **union-find (DSU)**, shortest paths (Dijkstra/BFS-0/1), MST | 🟧 |
| **5** | Dynamic programming foundations | 1D/2D DP, knapsack family, LIS, DP on grids, **DP + binary search**, intro DP-on-intervals | 🟦 |
| **6** | Greedy & ad-hoc observation | exchange argument, sorting-based greedy, interval scheduling, constructive problems, **"guess & stress-test" discipline** | 🟦 |
| **7** | Advanced graphs | SCC (Tarjan/Kosaraju), bridges/articulation, bipartite matching, LCA, **DP on trees / rerooting** | 🟧 |
| **8** | Range queries (full) & segment trees | segment tree (point/range), lazy propagation, **Fenwick 2D**, offline queries, Mo's algorithm intro | 🟧 |
| **9** | Advanced DP | bitmask DP, digit DP, DP optimizations (monotonic/divide-conquer/CHT intro), DP-on-trees advanced | 🟦 |
| **10** | Strings & math for CP | KMP, Z-function, rolling hash, tries, modular arithmetic, sieve, combinatorics, inclusion–exclusion, expected value | 🟧🟦 |
| **11** | Advanced/specialized | number theory (ExGCD, CRT), basic geometry (cross product, convex hull), game theory (Sprague-Grundy), flows intro (as *interface*, not Dinic internals) | 🟧 |
| **12** | Contest & interview synthesis | timed mixed contests, mock-ICPC, interview-style & **quant problem solving**, weakness-targeted upsolving, problem-setting | 🟨 |

### Changes from your original plan (and why)
- **Pulled range-query thinking far earlier** (prefix sums M1, BIT M2–3) per paper rule #2; full segment trees stay at M8 but are then *reused*, not introduced cold.
- **Binary search promoted to M2** — it's a foundational observation+technique multiplier used everywhere.
- **Greedy (M6) placed right after DP (M5)** so you contrast "when is greedy provably safe vs when do you need DP" — a core observation skill.
- **Math folded into M10–11** alongside strings rather than isolated, so it shows up in problems in context (paper: teach in problem context).
- **Implementation is a Month-1 first-class citizen**, not assumed.

## 3. Quant rail (parallel, not bolted-on Month 12)

Runs alongside the CP track from ~Month 3, ~2 sessions/week:

| Block | Content |
|-------|---------|
| Python rail | NumPy/pandas fluency, vectorization, clean research code, plotting |
| Probability & EV | expected value, linearity, conditional prob, classic interview puzzles |
| Combinatorics | counting, stars-and-bars, inclusion–exclusion (shared with M10) |
| Statistics | distributions, estimators, hypothesis testing basics |
| Stochastic intuition | random walks, Markov chains, martingale intuition |
| Market-making problems | optimal stopping, simple MM/EV brain-teasers, simulation |
| Mini-projects | a small backtest / Monte-Carlo simulation each month |

Quant problems are **tagged and tracked on the same 3-axis model** (observation/technique/implementation) so the analytics are unified.

## 4. Topic → axis-lean seed data

Each `Topic` row (see `02-DATA-MODEL.md`) is seeded with `month`, `lean`, `prereqs`, and a curated `resources` list (paper IO-2: survey many sources). The seed lives in `prisma/seed/topics.ts`. Lean labels drive **contest balance** (every weekly contest pairs an observation-heavy review problem with a technique-heavy topic problem).

## 5. How a topic is delivered (paper §5.2 lesson structure)

For each topic, the platform presents:
1. **Interface, not theory** — a 1-page "what problem does this solve + here's the template" note (paper P6), linking 3–5 external resources.
2. **One scaffold problem** (graded on completion) to warm up before the contest (paper P10).
3. **A handful of curated practice problems** from real contests, 3-axis tagged.
4. **The weekly contest** drawing P1 (review/observation), P2 (this topic/technique), P3 (implementation-heavy).
5. **Upsolve + reflect** loop afterward.
