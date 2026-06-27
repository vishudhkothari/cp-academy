"use client";

import { useState, useTransition } from "react";
import { saveReflection } from "@/app/actions";

type FailReason =
  | "OBSERVATION"
  | "TECHNIQUE"
  | "IMPLEMENTATION"
  | "DEBUG"
  | "TIME"
  | "CARELESS";

const LEVELS: { n: number; label: string; reason: FailReason | null }[] = [
  { n: 1, label: "Solved within time", reason: null },
  { n: 2, label: "Solved after (upsolved)", reason: null },
  { n: 3, label: "Knew it — had bugs", reason: "DEBUG" },
  { n: 4, label: "Knew it — couldn't implement", reason: "IMPLEMENTATION" },
  { n: 5, label: "Knew technique — couldn't connect it", reason: "OBSERVATION" },
  { n: 6, label: "Didn't know the technique", reason: "TECHNIQUE" },
];

const BUGS = [
  "OVERFLOW",
  "OFF_BY_ONE",
  "TYPO",
  "LOGIC",
  "WRONG_OBSERVATION",
  "COMPLEXITY",
  "EDGE_CASE",
  "OTHER",
] as const;

export function ReflectionForm({
  problemId,
  solved,
  contestId,
  inContest,
}: {
  problemId: string;
  solved: boolean;
  contestId?: string;
  inContest?: boolean;
}) {
  const [level, setLevel] = useState(0);
  const [bug, setBug] = useState<string>("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function submit() {
    if (!level) return;
    const lvl = LEVELS[level - 1];
    start(async () => {
      await saveReflection({
        problemId,
        solved: solved || level <= 2,
        stuckLevel: level,
        failReason: lvl.reason,
        bugType: level === 3 && bug ? (bug as (typeof BUGS)[number]) : null,
        note: note.trim(),
        contestId: contestId ?? null,
        // Level 1 = solved within the contest window.
        inContest: inContest ?? level === 1,
      });
      setSaved(true);
      setNote("");
      setBug("");
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        {LEVELS.map((l) => (
          <button
            key={l.n}
            onClick={() => setLevel(l.n)}
            className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
              level === l.n
                ? "border-accent bg-accent/10"
                : "border-border hover:bg-surface-2"
            }`}
          >
            <span className="text-muted tabular-nums">L{l.n}</span>
            <span>{l.label}</span>
          </button>
        ))}
      </div>

      {level === 3 && (
        <select
          value={bug}
          onChange={(e) => setBug(e.target.value)}
          className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        >
          <option value="">Bug type…</option>
          {BUGS.map((b) => (
            <option key={b} value={b}>
              {b.toLowerCase().replace("_", " ")}
            </option>
          ))}
        </select>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="~10 words: what was the missing insight?"
        className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
      />

      <button
        onClick={submit}
        disabled={!level || pending}
        className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
      >
        {saved ? "Saved ✓" : pending ? "Saving…" : "Save reflection"}
      </button>
    </div>
  );
}
