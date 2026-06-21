# 04 — Engines (Learning, Contest, Reflection, Coach, Analytics, Readiness)

All engines are **transparent and rule-based**, not black-box ML. For one user with sparse data, ML can't train and you can't trust what you can't inspect. Every recommendation must be explainable in one sentence ("scheduled because your *observation* on graphs is 0.3 and a review card is due").

---

## 1. Mastery model (the spine)

For each `(topic, axis)` we keep a score in `[0,1]` updated after each graded outcome (submission verdict + reflection):

```
outcome ∈ [0,1]  derived from:
  +  AC in contest (full credit, weighted by problem's axis difficulty)
  ~  AC upsolved (partial credit — paper values it but less than in-contest)
  -  WA/unsolved with high stuckLevel on that axis (negative signal)

score ← score + α · (outcome − score)        // EWMA, α≈0.3
attempts++ ; lastSeen = now
```

- Difficulty-weighted: solving a 5/5-implementation problem moves the implementation axis more than a 1/5.
- **Decay:** nightly, scores drift toward a topic floor if `lastSeen` is old (drives spaced review).
- Mastery thresholds gate curriculum progression (e.g. don't push Month-8 segment trees if Month-3 range-query mastery < 0.5).

---

## 2. Spaced-repetition scheduler (paper P12)

We schedule **review of solved patterns**, not flashcards. Each solved problem becomes a `ReviewCard` with FSRS-style `(stability, difficulty, due)`:

- On review, you don't re-solve from scratch — you **re-derive the key observation** ("what was the trick?") and optionally re-implement the core. Self-graded again→good/hard/forgot, which updates stability.
- Due cards surface in the daily plan. This directly serves retention, the paper's stated weakness of scattered CP topics.

> Library: a small FSRS implementation (or SM-2 to start). ~100 lines, fully inspectable.

---

## 3. "What's next" recommendation engine

The daily-plan builder runs a simple priority cascade each morning (Vercel Cron):

```
1. Due reviews (ReviewCard.due ≤ today)              → schedule first (retention)
2. Active weakness: lowest (topic,axis) mastery in   → 1–2 targeted problems
   current/recent curriculum month
3. Curriculum progression: next topic's scaffold +   → if current topic mastered
   lesson
4. Contest cadence: daily mini / weekly / monthly     → if due (see §4)
5. Upsolve backlog: unsolved contest problems         → nudge to upsolve (paper P3)
```

Output is a `DailyPlan` with `items[]`, each carrying a one-line `reason`. You can always override — it's a coach, not a warden.

---

## 4. Contest engine

Cadence (from your spec, kept):

| Kind | Format | Source of problems |
|------|--------|-------------------|
| Daily | 1–3 problems, untimed-ish mini | weakness-targeted picks |
| **Weekly** | **90 min, 3 problems** (paper's core) | P1 review/observation · P2 current-topic/technique · P3 implementation-heavy |
| Monthly | larger mixed set, longer window | spans recent months' topics |
| Quarterly | mock-ICPC style (5 problems, longer) | mixed difficulty, simulates real contest |

**Generator rules (paper P4/P9):**
- Slot 0 = a *review* problem from a prior month, observation-heavy — **never the current topic** (avoids "force the technique" trap).
- Slot 1 = current topic, technique-heavy.
- Slot 2 = implementation-heavy (often geometry/simulation), any topic.
- Difficulty pinned to your current readiness band (±1) so it's stretchy but not crushing.

**During contest:** timer, Monaco editor, Piston runs vs samples, submit-and-log. **You are not expected to solve all three** (paper). 

**After contest (where grading lives, paper P3):**
- Each problem gets a `SolveState` (in-contest / upsolved / unsolved) + a mandatory **Reflection**.
- The **upsolving tracker** lists everything not solved in-contest with a due nudge; upsolving is the primary credited activity.
- Time-per-problem is recorded → strategic-allocation analytics (paper SO-1).

---

## 5. Reflection + Mistake Taxonomy (paper P5 — unified)

After every attempt, a short capture (the paper asks for ~10 words):

1. **Stuck level (1–6)** — the paper's ladder:
   1. solved in contest · 2. upsolved · 3. knew it, had **bugs** · 4. knew it, couldn't **implement** · 5. knew the technique, couldn't **connect** it (observation gap) · 6. **didn't know** the technique.
2. **Fail axis** — auto-suggested from stuck level (3→DEBUG, 4→IMPLEMENTATION, 5→OBSERVATION, 6→TECHNIQUE), editable.
3. **Bug type** (if applicable) — overflow / off-by-one / typo / logic / wrong-observation / complexity / edge-case.
4. **One-line note.**

Aggregations (the payoff):
- "Your most common bug this month: **integer overflow** (7×)." → targeted checklist.
- "Stuck-level-5 (observation gap) clusters on **DP** and **graphs**." → schedule observation drills there.
- Hints used per problem (from the coach scaffold) roll in here.

---

## 6. Coaching scaffold (no paid API in v1 — see `01-ARCHITECTURE.md §5`)

- **6 gated levels:** Hint → Stronger Hint → Observation Hint → Approach → Editorial → Full Solution.
- Each level builds a **structured prompt** (problem link, your code, your error/verdict, 3-axis tags, and a strict instruction to reveal *only* that level) you paste into your own Claude.
- You must mark "still stuck" to unlock the next level → enforces graduated reveal.
- Platform logs `hintsUsed` (max level reached) per problem → feeds reflection/mastery.
- **Observation Hint (Level 3)** uses the paper's exact framing: *"What is this problem really asking? What known problem does it reduce to? What observation are you missing?"*
- Optional `COACH_MODE=api` later: same prompts run server-side (Opus 4.8 for editorial/submission review, Haiku 4.5 for hint-leveling — confirm against `claude-api` reference before enabling). Off by default.

---

## 7. Analytics

Built on the data above, rendered incrementally as it accrues:

- **Per-axis skill tree** — observation/technique/implementation mastery per topic (the headline view; nothing like it on LeetCode).
- **Activity heatmap** — submissions/upsolves per day.
- **Weakness dashboard** — lowest (topic, axis) cells + most-common bug types + stuck-level distribution.
- **Real-rating chart** — CF/AtCoder rating over time (synced) vs your readiness score.
- **Contest review** — in-contest vs upsolved ratio, time allocation, "should you have skipped P3?".
- **Upsolving backlog** — what's still unsolved, age, nudges.

---

## 8. Readiness score (replaces synthetic Elo)

A composite, explainable estimate of "what real contest are you ready for":

```
readiness = f(
   axis mastery across recent curriculum,         // breadth
   solve rate at difficulty D under time pressure, // the real predictor
   recent real CF/AtCoder results,                 // ground truth
   upsolve-to-solve conversion                      // learning velocity
)
→ maps to a recommendation: "Ready for Codeforces Div 3 / AtCoder ABC."
```

It is **anchored to your real rating** (synced via API), so it can't drift into fantasy the way an opponent-less Elo would. Snapshots stored in `RatingSnapshot(kind=READINESS)` for trend lines.
