# 02 — Data Model

Single user, relational, Postgres via Prisma. The schema is organized around the **3-axis skill model** (`00-DESIGN.md §2`): problems carry three axis ratings; submissions and reflections feed three mastery signals.

## 1. Entity overview

```
User ─┬─< Submission >─ Problem ─┬─< ProblemAxis (O/T/I difficulty)
      ├─< Reflection >─ Problem  ├─> Topic >─ TopicAxisMastery (per user, per axis)
      ├─< MasteryState (per Topic per Axis)
      ├─< ReviewCard (spaced repetition)
      ├─< ContestEntry >─ Contest >─< ContestProblem >─ Problem
      ├─< RatingSnapshot (real CF/AtCoder + readiness)
      ├─< ReferenceNote / Template
      └─< DailyPlan
```

## 2. Core tables (Prisma sketch — not final, illustrative)

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  cfHandle      String?
  atcoderHandle String?
  createdAt     DateTime @default(now())
  // relations omitted for brevity
}

model Problem {
  id            String   @id @default(cuid())
  source        Source                  // CODEFORCES | ATCODER | CSES | MANUAL
  externalId    String                  // e.g. "1850/A"
  title         String
  url           String                  // deep-link to original statement (we never mirror it)
  sourceRating  Int?                    // CF rating / AtCoder difficulty
  sourceTags    String[]                // raw tags from the OJ
  // --- our annotations ---
  topicId       String?
  obsDifficulty Int?     // 0-5  EO-1 observation load
  techDifficulty Int?    // 0-5  EO-2 technique load
  implDifficulty Int?    // 0-5  EO-3 implementation load
  isScaffold    Boolean  @default(false) // paper P10 warm-up problem
  notes         String?
  syncedAt      DateTime?
  @@unique([source, externalId])
}

model Topic {
  id        String   @id @default(cuid())
  slug      String   @unique            // "segment-tree", "greedy", ...
  name      String
  month     Int                          // curriculum month (see 03-CURRICULUM)
  lean      AxisLean                     // OBSERVATION_HEAVY | TECHNIQUE_HEAVY | MIXED (paper §5.1)
  prereqs   String[]                     // topic slugs
  resources Json                         // curated multi-source links (paper IO-2)
}

model Submission {
  id         String   @id @default(cuid())
  userId     String
  problemId  String
  language   Language                    // CPP | PYTHON
  source     String                      // the code
  verdict    Verdict                     // AC | WA | TLE | MLE | RE | CE | PENDING
  origin     SubmissionOrigin            // LOCAL_RUN | OJ_SYNCED | MANUAL
  inContest  Boolean  @default(false)
  contestId  String?
  runtimeMs  Int?
  memoryKb   Int?
  createdAt  DateTime @default(now())
}

// Paper P5: the 6-level reflection ladder IS the failure taxonomy.
model Reflection {
  id          String   @id @default(cuid())
  userId      String
  problemId   String
  contestId   String?
  solveState  SolveState   // IN_CONTEST | UPSOLVED | UNSOLVED
  stuckLevel  Int          // 1..6  (paper's Level 1-6 checklist)
  failAxis    Axis?        // OBSERVATION | TECHNIQUE | IMPLEMENTATION | DEBUG | TIME | CARELESS
  bugType     BugType?     // OVERFLOW | OFF_BY_ONE | TYPO | LOGIC | WRONG_OBSERVATION | COMPLEXITY | EDGE_CASE
  note        String       // short free-text (~10 words, paper's ask)
  hintsUsed   Int          @default(0)   // max hint level reached via coaching scaffold
  timeSpentMin Int?
  createdAt   DateTime @default(now())
}

// Per-user, per-topic, per-axis mastery (the heart of analytics & recommendations).
model MasteryState {
  id        String  @id @default(cuid())
  userId    String
  topicId   String
  axis      Axis                          // OBSERVATION | TECHNIQUE | IMPLEMENTATION
  score     Float   @default(0)           // 0..1 EWMA of outcomes weighted by difficulty
  attempts  Int     @default(0)
  lastSeen  DateTime?
  @@unique([userId, topicId, axis])
}

// Spaced repetition over solved PATTERNS (paper P12), FSRS/SM-2-style.
model ReviewCard {
  id         String   @id @default(cuid())
  userId     String
  problemId  String
  due        DateTime
  stability  Float                        // FSRS-ish
  difficulty Float
  reps       Int      @default(0)
  lapses     Int      @default(0)
}

model Contest {
  id        String   @id @default(cuid())
  kind      ContestKind                   // DAILY | WEEKLY | MONTHLY | QUARTERLY_MOCK
  durationMin Int
  startsAt  DateTime
  status    ContestStatus                 // SCHEDULED | LIVE | ENDED
  problems  ContestProblem[]
}

// Paper P4: 3 problems map to the 3 axes.
model ContestProblem {
  id         String  @id @default(cuid())
  contestId  String
  problemId  String
  slot       Int                          // 0=review/observation, 1=technique, 2=implementation
  targetAxis Axis
}

model ContestEntry {
  id         String  @id @default(cuid())
  userId     String
  contestId  String
  solvedInContest Int  @default(0)
  upsolved        Int  @default(0)
  performance     Float?                   // readiness contribution, NOT a synthetic Elo
}

model RatingSnapshot {
  id        String   @id @default(cuid())
  userId    String
  kind      RatingKind                     // CF_REAL | ATCODER_REAL | READINESS
  value     Int
  takenAt   DateTime @default(now())
}

model Template {                            // Personal Reference Book (paper P11/SO-2)
  id        String   @id @default(cuid())
  userId    String
  title     String
  language  Language
  topicId   String?
  code      String
  notes     String?
  version   Int      @default(1)
  updatedAt DateTime @updatedAt
}

model DailyPlan {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime
  items     Json                            // [{type:LESSON|REVIEW|PROBLEM|CONTEST, ref, reason}]
}
```

## 3. Enumerations

```
Source        = CODEFORCES | ATCODER | CSES | MANUAL
Language      = CPP | PYTHON
Verdict       = AC | WA | TLE | MLE | RE | CE | PENDING
Axis          = OBSERVATION | TECHNIQUE | IMPLEMENTATION   (+ DEBUG|TIME|CARELESS for Reflection.failAxis)
AxisLean      = OBSERVATION_HEAVY | TECHNIQUE_HEAVY | MIXED
SolveState    = IN_CONTEST | UPSOLVED | UNSOLVED
BugType       = OVERFLOW | OFF_BY_ONE | TYPO | LOGIC | WRONG_OBSERVATION | COMPLEXITY | EDGE_CASE | OTHER
ContestKind   = DAILY | WEEKLY | MONTHLY | QUARTERLY_MOCK
RatingKind    = CF_REAL | ATCODER_REAL | READINESS
```

## 4. Why this shape

- **3-axis difficulty on `Problem` + 3-axis `MasteryState`** is the spine. Everything analytical is a query over these.
- **`Reflection.stuckLevel (1–6)` unifies the paper's reflection ladder with your requested mistake taxonomy** — one capture, two uses.
- **`Submission.origin` distinguishes** a Piston local run from an OJ-synced authoritative verdict from a manual log — so "solved" means solved on the real judge.
- **`ContestProblem.slot/targetAxis`** bakes the paper's P1/P2/P3 structure into data, so the contest generator can't drift from it.
- **No synthetic Elo table** — `RatingSnapshot` holds *real* ratings + a derived `READINESS` score.
- **`isScaffold`** marks the paper's warm-up problems.

Indexes: `Submission(userId, problemId)`, `Reflection(userId, createdAt)`, `MasteryState(userId, topicId, axis)`, `ReviewCard(userId, due)`, `Problem(source, sourceRating)`.
