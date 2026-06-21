"use client";

import { useEffect, useState } from "react";

// Live countdown to endsAt (ms timestamp). Shows mm:ss, or "Ended".
export function ContestTimer({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, endsAt - now);
  const ended = remaining === 0;
  const total = Math.floor(remaining / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const label = ended
    ? "Ended"
    : (h > 0 ? `${h}:` : "") + `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <span
      className="rounded-md px-3 py-1 font-mono text-sm font-semibold tabular-nums"
      style={{
        background: ended ? "var(--surface-2)" : "var(--accent)",
        color: ended ? "var(--muted)" : "var(--accent-foreground)",
      }}
    >
      {label}
    </span>
  );
}
