"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { resyncCodeforces } from "@/app/actions";

export function ResyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await resyncCodeforces();
            setMsg(
              "error" in r
                ? r.error
                : `synced ${r.solved} solves (+${r.recorded} new)`,
            );
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
      >
        <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
        {pending ? "Syncing…" : "Re-sync Codeforces"}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
