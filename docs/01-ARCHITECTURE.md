# 01 — System Architecture

## 1. Stack (final)

| Layer | Choice | Why (for a solo, cloud, cost-conscious user) |
|-------|--------|----------------------------------------------|
| App framework | **Next.js 15 (App Router) + TypeScript** | One deployable for UI + API routes — collapses frontend/backend. React skill transfers from your Cutboard work. |
| UI | **Tailwind + shadcn/ui**, **Monaco** editor | Fast, accessible components; Monaco is the LeetCode-grade editor. |
| Data | **Supabase Postgres**, schema via **Prisma** | Managed Postgres, generous free tier, familiar from Cutboard. Prisma gives type-safe schema + migrations. |
| Auth | **Supabase Auth** (magic link / Google) | It's on the public internet — needs login. Lowest-effort secure option; single user. |
| Code execution (sample/custom runs) | **Piston API** (free, public; self-hostable later) | No sandbox to build/own. Abstracted behind one interface so it's swappable. |
| Authoritative verdicts | **Codeforces & AtCoder official APIs** (poll your submissions) | The *real* hidden tests live on the OJ; we legally cannot mirror them. "Solved?" syncs automatically. |
| Stress-testing | **Local CLI** (Python) the user runs on their PC | Stress-testing is a local debugging loop; doesn't belong in a serverless request. |
| AI coaching | **No paid API in v1** — coaching *scaffold* + your own Claude | Avoids double-paying. Prompt-generator + hint-level logger. Optional API toggle later. |
| Hosting | **Vercel** (app) + **Supabase** (DB/auth) | $0/month at solo scale, any-device access. |
| Background jobs | **Vercel Cron** (or Supabase scheduled fn) | Nightly OJ sync + daily-plan generation. No worker fleet. |

**Total running cost at solo scale: $0/month.** No Redis, no S3, no Docker in production, no microservices.

---

## 2. High-level diagram

```
                         ┌─────────────────────────────────────────┐
   Any device (PWA) ───► │  Next.js on Vercel                        │
                         │  ├─ React UI (Tailwind/shadcn, Monaco)    │
                         │  ├─ API routes (app logic, type-safe)     │
                         │  └─ Prisma client                          │
                         └──────────┬──────────────────┬─────────────┘
                                    │                  │
                       ┌────────────▼───────┐   ┌──────▼───────────────┐
                       │ Supabase Postgres  │   │ External (server-side)│
                       │  + Supabase Auth   │   │  ├─ Codeforces API     │
                       └────────────────────┘   │  ├─ AtCoder Problems API│
                                                 │  ├─ CSES (curated list) │
                                                 │  └─ Piston (run code)   │
                                                 └────────────────────────┘
   Vercel Cron ──► nightly: OJ submission sync, mastery decay, daily-plan build

   Local PC ──► `cpa stress` CLI (gen + brute + sol, diff)  ── reads templates from platform
```

All third-party calls (CF/AtCoder/Piston/Claude-later) happen **server-side only**. No API keys in the browser.

---

## 3. Code-execution & judging strategy (the part most people over-build)

There are three distinct needs; we serve each with the cheapest correct tool:

1. **"Did I actually solve this problem?" (authoritative)**
   → You submit on the real OJ. A nightly + on-demand sync pulls your submission verdicts via the **Codeforces API** (`user.status`) and **AtCoder** (kenkoooo Problems API). The platform marks the problem solved and timestamps it. This is free, legal, and uses real hidden tests. **CSES** has no public submission API → manual "I solved it" toggle.

2. **"Let me quickly test my code against the samples / a custom input while practicing."**
   → `POST /api/run` → **Piston**. Returns stdout/stderr/exit/time. We compare against expected sample output and show pass/fail. This is a convenience loop, not a verdict.

3. **"My code is WA on a hidden test and I can't find the bug."**
   → **Stress-tester CLI** run locally: generate random inputs, run brute-force + optimized, diff until mismatch, dump the failing case. The platform scaffolds the three files (generator, brute, solution) and the workflow; execution is on your machine where it belongs.

> Design seam: `lib/execution/Runner.ts` is an interface (`run(language, source, stdin): Promise<RunResult>`). Default impl calls Piston. A `SelfHostedPistonRunner` or `Judge0Runner` can drop in later without touching callers.

---

## 4. External data sync architecture

| Source | API | What we store | Refresh |
|--------|-----|---------------|---------|
| Codeforces | `problemset.problems`, `user.status`, `user.rating` | problem metadata (id, name, rating, tags, url), your AC set, your rating history | nightly + on-demand |
| AtCoder | kenkoooo Problems API (problems, difficulties, your submissions) | problem metadata + estimated difficulty + your AC set | nightly |
| CSES | static curated JSON (the ~300 problem set is fixed) | titles, section, url | one-time seed, manual updates |

We store **only metadata + our own annotations** (3-axis tags, topic mapping, notes). Statements/tests are **never** copied — the UI deep-links out. This keeps us legal and the catalog always-fresh.

Rate limits: CF allows ~1 req/2s; we batch and cache. All responses cached in Postgres with a `syncedAt`; we never hammer.

---

## 5. The AI coaching scaffold (no paid API in v1)

```
You're stuck on problem X
        │
        ▼
[Need a hint] ── platform builds a structured prompt ──► you paste into YOUR Claude
        │           (problem link + your code + your error + 3-axis tags +
        │            "Give ONLY a Level-N hint, do NOT reveal approach/solution")
        ▼
Platform logs: hintLevel=N, axis, problemId, timestamp  ──► weakness analytics
```

- **6 levels** (paper-aligned): 1 Hint · 2 Stronger Hint · 3 Observation Hint · 4 Approach · 5 Editorial · 6 Full Solution.
- The platform **gates** levels: you must mark "still stuck" to unlock the next prompt — this enforces the graduated reveal the paper insists on.
- The **logging** is the real value: which levels you needed, on which axis, on which topic → feeds mastery + "what's next."
- **Optional future toggle** `COACH_MODE=api`: same prompts sent to Claude server-side (Opus 4.8 for editorial/review, Haiku 4.5 for hint-leveling). Off by default. (Model/pricing details to be confirmed against the `claude-api` reference when/if enabled.)

---

## 6. Folder structure (Next.js App Router)

```
cp-website/
├─ docs/                      # design docs (this set)
├─ prisma/
│  ├─ schema.prisma           # see 02-DATA-MODEL.md
│  └─ seed/                   # CSES list, curriculum, topic taxonomy
├─ src/
│  ├─ app/                    # routes (dashboard, problems, contest, editor, analytics, reference)
│  │  ├─ api/                 #   run, sync, contest, reflection, coach-prompt
│  │  └─ (pages)/
│  ├─ components/             # shadcn-based UI
│  ├─ lib/
│  │  ├─ execution/           # Runner interface + Piston impl
│  │  ├─ sources/             # codeforces.ts, atcoder.ts, cses.ts
│  │  ├─ engine/              # mastery, scheduler, contest-gen, readiness
│  │  ├─ coach/               # prompt builder + hint gating
│  │  └─ db.ts                # Prisma client
│  └─ types/
├─ cli/                       # `cpa` stress-tester (Python or Node)
└─ ...
```

---

## 7. Security & privacy

- Single-user app, but public URL → **all data behind Supabase Auth**; Row-Level-Security or a hard `userId` guard on every query.
- No secrets in client bundles; CF/Piston/(Claude) calls are server-only.
- Your code submissions are your own — stored in your DB, never sent anywhere except (you → your Claude) by your explicit copy action.

---

## 8. Rejected alternatives (for the record)

- **Judge0 self-host as primary judge:** correct but adds a container to babysit; Piston + OJ-sync covers the need at zero ops. Judge0 remains a drop-in via the Runner seam.
- **Vite + React SPA + separate FastAPI backend:** two deploy targets, more glue. Next.js full-stack is simpler and the React skill is identical.
- **Mongo / Supabase-client-only (no Prisma):** the schema is highly relational (problems↔submissions↔mastery↔reflections↔contests). Prisma's typed relations are worth it.
