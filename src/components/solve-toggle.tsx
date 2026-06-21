"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toggleSolved } from "@/app/actions";

export function SolveToggle({
  problemId,
  solved,
  size = 18,
}: {
  problemId: string;
  solved: boolean;
  size?: number;
}) {
  const [isSolved, setSolved] = useState(solved);
  const [pending, start] = useTransition();

  // Keep in sync when the server re-renders with a new value (e.g. CF re-sync).
  useEffect(() => setSolved(solved), [solved]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !isSolved;
        setSolved(next);
        start(() => toggleSolved(problemId, next));
      }}
      disabled={pending}
      title={isSolved ? "Solved — click to unmark" : "Mark as solved"}
      className="inline-flex shrink-0 items-center justify-center rounded-full transition hover:scale-110"
      style={{ width: size, height: size }}
    >
      {pending ? (
        <Loader2 size={size} className="animate-spin text-muted" />
      ) : isSolved ? (
        <span
          className="flex items-center justify-center rounded-full bg-ac"
          style={{ width: size, height: size }}
        >
          <Check size={size * 0.62} strokeWidth={3} style={{ color: "var(--background)" }} />
        </span>
      ) : (
        <span
          className="rounded-full border-2 border-muted/70 transition-colors hover:border-ac"
          style={{ width: size, height: size }}
        />
      )}
    </button>
  );
}
