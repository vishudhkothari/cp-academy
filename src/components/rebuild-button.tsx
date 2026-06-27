"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hammer } from "lucide-react";

// Rebuilds the problem catalog + curated path (re-syncs CF/AtCoder, rescores
// quality, regenerates every ladder). Takes ~30-60s; the path only changes when
// this (or a seed/cron) runs, since curation lives in the database.
export function RebuildButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function rebuild() {
    setRunning(true);
    setMsg("Rebuilding — this can take up to a minute…");
    fetch("/api/rebuild", { method: "POST" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          setMsg(data.error ?? `Failed (HTTP ${res.status}).`);
        } else {
          setMsg(
            `Rebuilt: ${data.curated?.curated ?? 0} curated problems across ${data.curated?.topics ?? 0} topics.`,
          );
          start(() => router.refresh());
        }
      })
      .catch((e) => setMsg((e as Error).message))
      .finally(() => setRunning(false));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={running || pending}
        onClick={rebuild}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
      >
        <Hammer size={13} className={running ? "animate-pulse" : ""} />
        {running ? "Rebuilding…" : "Rebuild path"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
