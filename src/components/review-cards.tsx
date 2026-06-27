"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Brain } from "lucide-react";
import { gradeReviewCard } from "@/app/actions";
import type { ReviewGrade } from "@/lib/engine/review";

type Card = {
  cardId: string;
  problemId: string;
  title: string;
  url: string;
  topic: string | null;
  reps: number;
  overdueDays: number;
};

const GRADES: { g: ReviewGrade; label: string; color: string }[] = [
  { g: "forgot", label: "Forgot", color: "var(--wa)" },
  { g: "hard", label: "Hard", color: "var(--tech)" },
  { g: "good", label: "Good", color: "var(--accent)" },
  { g: "easy", label: "Easy", color: "var(--ac)" },
];

function ReviewItem({ card }: { card: Card }) {
  const [revealed, setRevealed] = useState(false);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  if (done) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{card.title}</div>
          <div className="mt-0.5 text-xs text-muted">
            {card.topic ?? "—"} · {card.reps} prior review{card.reps === 1 ? "" : "s"}
            {card.overdueDays > 0 ? ` · ${card.overdueDays}d overdue` : ""}
          </div>
        </div>
        <a
          href={card.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted hover:text-foreground"
        >
          Open <ExternalLink size={12} />
        </a>
      </div>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted hover:border-accent hover:text-foreground"
        >
          <Brain size={13} /> Recall the key observation, then grade yourself
        </button>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-xs text-muted">
            How well did you recall the trick — not whether you could re-type the code?
          </p>
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((x) => (
              <button
                key={x.g}
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await gradeReviewCard(card.cardId, x.g);
                    setDone(true);
                  })
                }
                className="rounded-md border border-border px-2 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
                style={{ color: x.color }}
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ReviewCards({ cards }: { cards: Card[] }) {
  return (
    <div className="space-y-3">
      {cards.map((c) => (
        <ReviewItem key={c.cardId} card={c} />
      ))}
    </div>
  );
}
