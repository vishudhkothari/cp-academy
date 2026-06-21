"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError("Wrong password");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <form onSubmit={submit} className="w-80 rounded-xl border border-border bg-surface p-6">
        <div className="text-sm font-semibold tracking-tight">CP Academy</div>
        <div className="mt-0.5 text-xs text-muted">Enter your password to continue</div>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="mt-4 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {error && <div className="mt-2 text-xs text-wa">{error}</div>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "…" : "Enter"}
        </button>
      </form>
    </div>
  );
}
