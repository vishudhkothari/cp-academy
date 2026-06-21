# CP Academy — Master Design Document

> A personal, contest-based competitive-programming & quant-prep platform for **one user**, built on the pedagogy of *"Curriculum Design of Competitive Programming: a Contest-based Approach"* (Luo, Purdue).

This is the source-of-truth design. Everything else (`01`–`05`) elaborates a slice of it.

---

## 1. Vision

A daily training system that does what LeetCode/Codeforces **cannot** do for a solo learner: **measure the three independent skills competitive programming actually requires, find which one is failing, and drive practice at that weakness** — under realistic time pressure, with the real learning happening in the *upsolve*.

The goal is concrete and measurable: **Codeforces Specialist → Expert → Candidate Master (1900+)**, plus the probability/EV/implementation fluency that quant interviews test.

This is not a LeetCode clone. It is a personal CP academy whose curriculum, contests, and coaching are derived from the paper.

---

## 2. The one idea that drives everything: the 3-axis skill model

The paper's central thesis (its "Enduring Outcomes"):

| Axis | Paper code | Definition | Topics that lean this way |
|------|-----------|------------|---------------------------|
| **Observation** | EO-1 | Reduce an *unknown* problem to a *known* one. | greedy, DP, combinatorics, ad-hoc |
| **Technique** | EO-2 | Apply known algorithms/data structures correctly. | segment trees, geometry, strings, flows |
| **Implementation** | EO-3 | Translate a known solution into a correct, fast, debugged program. | simulation, geometry, heavy-case work |

> A normal judge records one bit: *solved / not solved*. This platform records **three** mastery signals per problem and per topic, because **your weakness is almost always one specific axis**, and you can only train what you measure.

Every problem is annotated `(observation, technique, implementation)` on a 0–5 scale. Every submission/reflection updates per-axis mastery. The "what do I do next" engine, the analytics, and the coach all read from these three numbers. **If we get nothing else right, we get this right.**

---

## 3. Principles extracted from the paper (and how each becomes a feature)

| # | Paper principle | Platform feature |
|---|-----------------|------------------|
| P1 | Three skills tracked separately (EO-1/2/3) | 3-axis tags + per-axis mastery model (§2) |
| P2 | Contest-based, time pressure is the differentiator | Contest engine: timed 3-problem sessions (§04) |
| P3 | **Grading is on the upsolve, not the contest** — "what you failed is the golden opportunity" | Upsolving tracker is first-class; in-contest solve and post-contest solve are distinct states |
| P4 | 3 problems per contest map to the 3 axes (P1 review/observation, P2 current-topic technique, P3 implementation-heavy) | Contest generator enforces this slot structure |
| P5 | 6-level reflection ladder = a failure taxonomy (solved → upsolved → debug → can't-implement → can't-connect-technique → don't-know-technique) | Unified Reflection + Mistake Taxonomy (§04) |
| P6 | Teach the *interface*, not the theory ("here's the template, Google the proof, go solve") | Lessons are short + link to canonical resources; reference book holds templates |
| P7 | Intuition > proof; guess if you can't find a counterexample | Coach never demands proofs; "guess & stress-test" workflow is endorsed |
| P8 | Implementation is a real skill, not beneath you | Implementation axis is tracked & contested equally; idiom library (dx/dy etc.) in reference |
| P9 | Don't force the week's technique onto every problem | Contest P1 is always *review/mixed*, never the current topic; coach's first hint is "what is this problem really asking?" |
| P10 | Scaffolding: a graded-on-completion warm-up problem before each contest | Each topic ships one "scaffold" problem unlocked with the lesson |
| P11 | Code reference grows over time; improving it is itself learning (SO-2) | Personal Reference Book: versioned templates + notes, insertable into editor |
| P12 | Spaced review for retention ("review last week's first-solver code") | Spaced-repetition scheduler over solved *patterns*, not just problems (§04) |
| P13 | Survey many sources for one topic (IO-2) | Each topic links a curated multi-source resource list |
| P14 | Problem-setting deepens understanding (SO-3) | Problem-setting module (final phase) |
| P15 | Strategic time allocation (SO-1) | Contest analytics: time-per-problem, "should you have skipped P3?" |

---

## 4. Scope decisions — what I am NOT building, and why

You asked for production-grade decisions and for over-engineered, solo-hostile features to be cut. These are deliberate **rejections** of parts of the original spec:

| Rejected | Why it's wrong for a solo user | Replacement |
|----------|--------------------------------|-------------|
| From-scratch sandboxed Docker online judge with "scalable architecture" | Months of work + security liability; you'd be sandboxing your own code against yourself; scaling for 1 user is meaningless | Auto-sync real verdicts from CF/AtCoder APIs; free **Piston** API for sample runs; local CLI for stress tests (§02) |
| Ingestion pipelines mirroring statements/**hidden tests**/editorials from 9 platforms | ToS violations (esp. LeetCode), legal exposure, huge effort, stale content | **Metadata + annotation layer** over official APIs; deep-link to original statements; never mirror tests (§02, §03) |
| Postgres + Redis + S3 + microservices + CI/CD pipeline | Pure ops overhead for one person | Next.js full-stack + Supabase Postgres; no Redis/S3/microservices (§02) |
| Synthetic Codeforces-style Elo for internal contests | Elo against no opponents is statistical noise | Track **real** CF/AtCoder rating via API + a calibrated **readiness score** from solve-under-time (§04) |
| Team contests / cooperative learning infrastructure | You have no team | AI-coach-scaffold acts as discussion partner / "first solver" editorial |
| Paid AI API integration in v1 | Double-paying for Claude you already have | **Coaching scaffold**: structured prompt-generator + 6-level tracker; you run generation through your own Claude; optional API toggle later (§04) |

**Kept and prioritized** because they materially improve learning: 3-axis model, contest engine with upsolving-first grading, reflection→mistake taxonomy, transparent spaced-repetition/mastery engine, 6-level coaching scaffold, growing reference book, stress-tester, analytics, scaffold warm-up problems, phased quant track. **Problem-setting comes last.**

---

## 5. Product Requirements (condensed PRD)

### 5.1 Primary user
One person: ~50 LeetCode problems solved, needs a C++/STL refresher, not a beginner but far from advanced, targeting CM (1900+) and quant interviews over ~12 months. Uses the platform **daily**, across devices.

### 5.2 Core jobs-to-be-done
1. **"Tell me what to do today."** → A generated daily plan: lesson/review/problems/contest as appropriate.
2. **"Make me practice under pressure."** → Timed contests (daily mini, weekly 90-min/3-problem, monthly, quarterly mock-ICPC).
3. **"Find my actual weakness."** → Per-axis mastery + reflection analytics → "your observation on graphs is weak."
4. **"Coach me without spoiling it."** → 6-level hint ladder via the coaching scaffold.
5. **"Help me retain it."** → Spaced repetition + upsolving discipline.
6. **"Grow my toolkit."** → Personal reference book + stress-tester + template library.
7. **"Am I ready for a real Div 2 / ABC?"** → Readiness score.

### 5.3 Must-have (MVP, Phases 2–4)
- Auth (single user, any device).
- Problem catalog synced from CF + AtCoder + CSES, with 3-axis tags.
- Monaco editor (C++/Python) + Piston "run vs samples/custom".
- Submission & verdict tracking (manual log + OJ auto-sync).
- Reflection + mistake-taxonomy capture after every attempt.
- Weekly contest (3-problem structure) + upsolving tracker.

### 5.4 Should-have (Phases 5–7)
- Learning engine ("what's next"), spaced repetition, mastery dashboard.
- Coaching scaffold (prompt-generator + hint-level log).
- Analytics (heatmaps, per-axis trees, weakness dashboard, real-rating chart).
- Reference book + stress-tester CLI.

### 5.5 Could-have (Phase 8+)
- Quant track (probability/EV/combinatorics + Python rail + MM brain-teasers).
- Problem-setting module.
- Optional real Claude API integration toggle.

### 5.6 Explicit non-goals
Multi-user/social features, real-time collaboration, mirroring copyrighted content, a custom sandbox, mobile-native apps (PWA is enough), anything "scalable" beyond one user.

---

## 6. Success criteria

- Platform reliably answers "what should I do today?" every day for a year.
- Per-axis mastery numbers visibly move and correlate with real CF rating gains.
- The reflection data surfaces at least one actionable, non-obvious weakness per month.
- You actually use it daily (the real metric). If a feature isn't used in a month, it gets cut, not polished.

---

See: [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) · [`02-DATA-MODEL.md`](02-DATA-MODEL.md) · [`03-CURRICULUM.md`](03-CURRICULUM.md) · [`04-ENGINES.md`](04-ENGINES.md) · [`05-ROADMAP.md`](05-ROADMAP.md)
