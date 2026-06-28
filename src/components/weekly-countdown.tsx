"use client";

import { useEffect, useState } from "react";

// Live ticking countdown to a target instant (ISO string). Renders a stable
// placeholder until mounted to avoid a hydration mismatch (server time ≠ client).
export function WeeklyCountdown({ target, prefix = "" }: { target: string; prefix?: string }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return <span className="tabular-nums">{prefix}…</span>;

  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return <span className="tabular-nums">now</span>;

  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const text = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${ss}s` : `${m}m ${ss}s`;

  return <span className="tabular-nums">{prefix}{text}</span>;
}
