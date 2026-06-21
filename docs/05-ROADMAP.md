# 05 — Build Roadmap (phased)

Each phase ships something usable. We do **not** build all of it before you can train — the core loop (Phases 2–4) is usable within the first slice, and everything after enriches it. For every phase: **Goal · Deliverables · Risks · Done-when.**

---

## Phase 1 — Design (this set of docs) ✅
- **Goal:** lock the pedagogy, scope, stack, schema.
- **Deliverables:** `docs/00`–`05`.
- **Done-when:** you approve the scope decisions in `00-DESIGN.md §4`.

## Phase 2 — Foundation
- **Goal:** a running, authenticated app with the problem catalog.
- **Deliverables:** Next.js + TS + Tailwind + shadcn scaffold; Supabase project + Prisma schema + first migration; Supabase Auth (single user); Codeforces + AtCoder + CSES sync into the catalog; problem browser with 3-axis tag display/edit; topic + curriculum seed data.
- **Risks:** CF API rate limits (mitigate: batch + cache + nightly). Supabase/Prisma connection-pooling on serverless (mitigate: Prisma + pgBouncer/Supabase pooler).
- **Done-when:** you can log in from your phone, browse synced problems, and see/set 3-axis tags.

## Phase 3 — Core practice loop
- **Goal:** read → code → run → log → reflect.
- **Deliverables:** Monaco editor (C++/Python) with template insertion; `POST /api/run` via Piston (samples/custom); submission logging; OJ-sync that marks problems solved authoritatively; the Reflection + Mistake-Taxonomy capture.
- **Risks:** Piston rate limits (mitigate: it's only for convenience runs; degrade gracefully). Parsing CF `user.status` correctly.
- **Done-when:** you solve a CF problem, the platform auto-detects the AC, and you log a reflection.

## Phase 4 — Contest engine + upsolving
- **Goal:** the paper's core assessment loop.
- **Deliverables:** weekly 3-problem contest generator (slot/axis rules), contest UI + timer, post-contest reflection per problem, upsolving tracker with nudges.
- **Risks:** picking well-calibrated problems before mastery data exists (mitigate: seed difficulty from CF rating + your ~50-problem history; calibrate as data grows).
- **Done-when:** you run a weekly contest end-to-end and the upsolve backlog populates.

## Phase 5 — Learning engine
- **Goal:** "tell me what to do today."
- **Deliverables:** mastery model; FSRS/SM-2 spaced-repetition review cards; daily-plan builder (priority cascade) on Vercel Cron; mastery-gated curriculum progression.
- **Risks:** over-scheduling/burnout (mitigate: cap daily items; everything overridable).
- **Done-when:** a daily plan appears each morning with one-line reasons.

## Phase 6 — Coaching scaffold
- **Goal:** never-spoil hints + logging, zero API cost.
- **Deliverables:** 6-level gated hint UI; structured prompt generator ("copy to your Claude"); hint-level logging into reflections; optional `COACH_MODE=api` stub (off).
- **Risks:** friction of copy-paste (accept for v1; API toggle later).
- **Done-when:** you get a Level-2 observation prompt, paste into Claude, and the platform logs it.

## Phase 7 — Analytics + reference book + stress-tester
- **Goal:** see your weaknesses; grow your toolkit; debug hard WAs.
- **Deliverables:** per-axis skill tree, heatmap, weakness dashboard, real-rating chart, contest review; Personal Reference Book (versioned templates/notes, insert-into-editor); `cpa` stress-tester CLI (gen+brute+sol+diff).
- **Done-when:** the skill tree shows real per-axis movement and the stress-tester finds a planted bug.

## Phase 8 — Quant rail
- **Goal:** quant-interview prep on the same rails.
- **Deliverables:** Python track content; probability/EV/combinatorics/stats problem sets tagged on the 3-axis model; MM/EV brain-teasers; monthly mini-project scaffolds (Monte-Carlo/backtest).
- **Done-when:** quant problems flow through the same practice/reflection/analytics loop.

## Phase 9 — Problem-setting (paper's advanced activity, last)
- **Goal:** deepen understanding by creating problems.
- **Deliverables:** problem authoring (statement/constraints/samples), a checker harness, "set 3 problems" workflow feeding your own contests.
- **Done-when:** you author a problem and use it in a self-contest.

## Phase 10 — Polish & readiness
- **Goal:** daily-driver quality.
- **Deliverables:** readiness score surfacing real-contest recommendations; PWA install; backups; the monthly "cut what you don't use" review.

---

## Cross-cutting engineering standards
- **Type-safe end to end** (TS + Prisma + zod on API boundaries).
- **Every recommendation is explainable** (one-line `reason`).
- **Swappable seams**: `Runner` (execution), `Source` (OJ adapters), `Coach` (scaffold↔API).
- **Migrations, not hand-edits.** Seed data in version control.
- **Ship usable slices.** If a feature isn't used within a month of shipping, cut it.

## Sequencing note
Phases 2–4 are the **MVP** — that's the minimum that makes the platform worth opening daily. Phases 5–7 are where it becomes a *coach*. 8–10 are enrichment. I recommend building strictly in order; each phase's data is the previous phase's payoff.
