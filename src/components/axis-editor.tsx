"use client";

import { useState, useTransition } from "react";
import { setProblemAxes } from "@/app/actions";

const AXES = [
  { key: "obs", label: "Observation", color: "var(--obs)" },
  { key: "tech", label: "Technique", color: "var(--tech)" },
  { key: "impl", label: "Implementation", color: "var(--impl)" },
] as const;

type Vals = { obs: number | null; tech: number | null; impl: number | null };

export function AxisEditor({
  problemId,
  obs,
  tech,
  impl,
}: {
  problemId: string;
  obs: number | null;
  tech: number | null;
  impl: number | null;
}) {
  const [vals, setVals] = useState<Vals>({ obs, tech, impl });
  const [, start] = useTransition();

  function set(key: keyof Vals, v: number) {
    const next = { ...vals, [key]: vals[key] === v ? null : v };
    setVals(next);
    start(() => setProblemAxes(problemId, next));
  }

  return (
    <div className="space-y-3">
      {AXES.map((a) => (
        <div key={a.key}>
          <div className="text-xs font-medium" style={{ color: a.color }}>
            {a.label}
          </div>
          <div className="mt-1.5 flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((v) => {
              const active = vals[a.key] === v;
              return (
                <button
                  key={v}
                  onClick={() => set(a.key, v)}
                  className="h-7 w-7 rounded border text-xs tabular-nums transition-colors"
                  style={
                    active
                      ? { background: a.color, borderColor: a.color, color: "#0b0e14" }
                      : { borderColor: "var(--border)", color: "var(--muted)" }
                  }
                >
                  {v}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
