# CP Academy — Design Docs

A personal, contest-based competitive-programming & quant-prep platform for one user, built on the pedagogy of *Curriculum Design of Competitive Programming: a Contest-based Approach* (Luo, Purdue).

Read in order:

1. [`00-DESIGN.md`](00-DESIGN.md) — vision, the 3-axis skill model, paper principles → features, **scope decisions (what we cut & why)**, PRD.
2. [`01-ARCHITECTURE.md`](01-ARCHITECTURE.md) — stack, diagram, judging/sync strategy, AI-coaching scaffold, security.
3. [`02-DATA-MODEL.md`](02-DATA-MODEL.md) — Prisma schema sketch + rationale.
4. [`03-CURRICULUM.md`](03-CURRICULUM.md) — revised 12-month roadmap + quant rail + topic→axis taxonomy.
5. [`04-ENGINES.md`](04-ENGINES.md) — mastery, spaced repetition, contest engine, reflection/mistake taxonomy, coaching scaffold, analytics, readiness.
6. [`05-ROADMAP.md`](05-ROADMAP.md) — phased build plan (Goal/Deliverables/Risks/Done-when).

## The one-paragraph summary
Most judges record one bit per problem: solved or not. This platform records **three** — *observation*, *technique*, *implementation* — because your weakness is almost always one specific axis, and you can only train what you measure. On top of that it runs the paper's contest-based loop (timed 3-problem sessions where **upsolving is the graded activity**), a transparent spaced-repetition/mastery engine that decides what you do each day, a never-spoil 6-level coaching scaffold that routes generation through the Claude you already pay for, and analytics that surface your real weaknesses. Built cloud-first on Next.js + Supabase + Vercel for **$0/month**, with real verdicts synced from Codeforces/AtCoder rather than a custom judge.
