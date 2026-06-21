"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Lock, Lightbulb, Eye } from "lucide-react";
import { recordCoachLevel } from "@/app/actions";

type Level = {
  n: number;
  name: string;
  blurb: string;
  ask: string;
};

const LEVELS: Level[] = [
  {
    n: 1,
    name: "Hint",
    blurb: "A gentle nudge.",
    ask: "Give me ONLY a small hint to get started — one sentence pointing at what to think about. Do NOT reveal the approach or the solution.",
  },
  {
    n: 2,
    name: "Stronger Hint",
    blurb: "Point at the key structure.",
    ask: "Give me a stronger hint — point me toward the key quantity, structure, or simplification to look at. Still do NOT give the full approach.",
  },
  {
    n: 3,
    name: "Observation Hint",
    blurb: "The reduction to a known problem.",
    ask: "What is the KEY OBSERVATION that reduces this to a known or simpler problem? Help me see the reduction itself, but don't spell out the full algorithm steps.",
  },
  {
    n: 4,
    name: "Approach",
    blurb: "The algorithm, no code.",
    ask: "Explain the approach / algorithm to solve this problem (no code). Include the core idea and why it works.",
  },
  {
    n: 5,
    name: "Editorial",
    blurb: "Full explanation — you write the code.",
    ask: "Give me a full editorial: the approach, why it is correct, and the time & space complexity. I will write the code myself.",
  },
  {
    n: 6,
    name: "Full Solution",
    blurb: "All approaches with code. Marks 'solution seen'.",
    ask: "Give me EVERY distinct approach from brute force to optimal. For each: the key observation, the algorithm, time & space complexity, and clean C++ code. End by stating which is the intended solution.",
  },
];

export function CoachLadder({
  problemId,
  title,
  url,
  initialLevel,
}: {
  problemId: string;
  title: string;
  url: string;
  initialLevel: number;
}) {
  const [unlocked, setUnlocked] = useState(initialLevel);
  const [confirming6, setConfirming6] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [, start] = useTransition();

  function promptFor(l: Level) {
    return `Problem: ${title}\nLink: ${url}\n\n${l.ask}\n\n(If you want feedback on my own attempt, I'll paste my code below.)`;
  }

  function unlock(level: number) {
    setUnlocked(level);
    start(() => recordCoachLevel(problemId, level));
  }

  function copy(l: Level) {
    navigator.clipboard.writeText(promptFor(l)).then(() => {
      setCopied(l.n);
      setTimeout(() => setCopied(null), 1800);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Never spoils. Each rung gives you a prompt to paste into your own Claude —
        use the lowest level that unblocks you. Your progress is saved.
      </p>

      {LEVELS.map((l) => {
        const isOpen = l.n <= unlocked;
        const isNext = l.n === unlocked + 1;

        if (isOpen) {
          return (
            <div key={l.n} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {l.n === 6 ? (
                    <Eye size={14} className="text-warn" />
                  ) : (
                    <Lightbulb size={14} className="text-accent" />
                  )}
                  Level {l.n} · {l.name}
                </div>
                <button
                  onClick={() => copy(l)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
                >
                  {copied === l.n ? <Check size={12} className="text-ac" /> : <Copy size={12} />}
                  {copied === l.n ? "Copied" : "Copy prompt"}
                </button>
              </div>
              <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-surface-2 p-2.5 text-xs text-muted">
                {promptFor(l)}
              </pre>
            </div>
          );
        }

        if (isNext) {
          // The confirm gate only applies to the full-solution rung.
          if (l.n === 6 && !confirming6) {
            return (
              <button
                key={l.n}
                onClick={() => setConfirming6(true)}
                className="flex w-full items-center justify-between rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5 text-sm hover:bg-warn/10"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Eye size={14} className="text-warn" /> Level 6 · Full Solution
                </span>
                <span className="text-xs text-muted">{l.blurb}</span>
              </button>
            );
          }
          if (l.n === 6 && confirming6) {
            return (
              <div key={l.n} className="rounded-lg border border-warn/40 bg-warn/5 p-4 text-center">
                <div className="text-sm font-medium">See the full solution?</div>
                <p className="mt-1 text-xs text-muted">
                  This marks the problem <strong className="text-foreground">solution seen</strong> in
                  your analytics.
                </p>
                <div className="mt-3 flex justify-center gap-2">
                  <button
                    onClick={() => setConfirming6(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setConfirming6(false);
                      unlock(6);
                    }}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90"
                  >
                    Yes, reveal
                  </button>
                </div>
              </div>
            );
          }
          return (
            <button
              key={l.n}
              onClick={() => unlock(l.n)}
              className="flex w-full items-center justify-between rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted hover:border-accent hover:text-foreground"
            >
              <span className="font-medium">Still stuck? Unlock Level {l.n} · {l.name}</span>
              <span className="text-xs">{l.blurb}</span>
            </button>
          );
        }

        return (
          <div
            key={l.n}
            className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2.5 text-sm text-muted/50"
          >
            <Lock size={13} /> Level {l.n} · {l.name}
          </div>
        );
      })}
    </div>
  );
}
