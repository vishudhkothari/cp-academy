"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { resyncCodeforces, resyncAtcoder } from "@/app/actions";

export function ResyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function sync(which: "cf" | "atcoder") {
    start(async () => {
      const r = which === "cf" ? await resyncCodeforces() : await resyncAtcoder();
      setMsg(
        "error" in r ? r.error : `synced ${r.solved} solves (+${r.recorded} new)`,
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => sync("cf")}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
      >
        <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
        Re-sync Codeforces
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => sync("atcoder")}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-2 disabled:opacity-50"
      >
        <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
        Re-sync AtCoder
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
