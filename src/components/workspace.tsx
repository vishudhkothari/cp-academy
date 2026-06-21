"use client";

import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import { Play, Copy, Check, Download, MoreVertical, Loader2 } from "lucide-react";
import {
  TEMPLATES,
  LANG_LABEL,
  getTemplate,
  saveTemplate,
  resetTemplate,
} from "@/lib/templates";
import { DRACULA } from "@/lib/monaco-dracula";

type RunLang = "CPP" | "PYTHON";
const MONACO_LANG: Record<RunLang, string> = { CPP: "cpp", PYTHON: "python" };

type RunResult = {
  ok: boolean;
  stage: "compile" | "run";
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
  error?: string;
};

export function Workspace({
  problemId,
  filenameBase,
}: {
  problemId: string;
  filenameBase: string;
}) {
  const [lang, setLang] = useState<RunLang>("CPP");
  const [code, setCode] = useState<string>(TEMPLATES.CPP);
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const storageKey = (l: RunLang) => `code:${problemId}:${l}`;

  // Load saved per-problem code, else your template (custom or built-in).
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(storageKey(lang)) : null;
    setCode(saved ?? getTemplate(lang));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, problemId]);

  function onCodeChange(v: string | undefined) {
    const next = v ?? "";
    setCode(next);
    try {
      localStorage.setItem(storageKey(lang), next);
    } catch {}
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function copyCode() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function downloadCode() {
    const ext = lang === "CPP" ? "cpp" : "py";
    const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filenameBase}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, source: code, stdin }),
      });
      setResult(await res.json());
    } catch (e) {
      setResult({
        ok: false,
        stage: "run",
        stdout: "",
        stderr: (e as Error).message,
        code: null,
        signal: null,
      });
    } finally {
      setRunning(false);
    }
  }

  const menuItem =
    "flex w-full items-center px-3 py-2 text-left text-xs hover:bg-surface-2";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-surface">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1 rounded-md bg-surface-2 p-0.5">
          {(["CPP", "PYTHON"] as RunLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                lang === l ? "bg-background text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          {toast && <span className="mr-1 text-[11px] text-muted">{toast}</span>}
          <button
            onClick={copyCode}
            title="Copy code"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
          >
            {copied ? <Check size={13} className="text-ac" /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={downloadCode}
            title="Save to device"
            className="inline-flex items-center rounded-md border border-border p-1.5 text-muted hover:text-foreground"
          >
            <Download size={14} />
          </button>

          {/* Template / overflow menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              title="Template options"
              className="inline-flex items-center rounded-md border border-border p-1.5 text-muted hover:text-foreground"
            >
              <MoreVertical size={15} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-md border border-border bg-surface shadow-lg">
                  <button
                    className={menuItem}
                    onClick={() => {
                      onCodeChange(getTemplate(lang));
                      setMenuOpen(false);
                    }}
                  >
                    Insert template
                  </button>
                  <button
                    className={menuItem}
                    onClick={() => {
                      saveTemplate(lang, code);
                      setMenuOpen(false);
                      flash("Saved — applies to new problems");
                    }}
                  >
                    Save current as template
                  </button>
                  <button
                    className={`${menuItem} text-muted`}
                    onClick={() => {
                      resetTemplate(lang);
                      onCodeChange(TEMPLATES[lang]);
                      setMenuOpen(false);
                      flash("Reset to built-in template");
                    }}
                  >
                    Reset to built-in default
                  </button>
                </div>
              </>
            )}
          </div>

          <button
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
          >
            {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language={MONACO_LANG[lang]}
          theme="dracula"
          value={code}
          onChange={onCodeChange}
          beforeMount={(monaco) => monaco.editor.defineTheme("dracula", DRACULA)}
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            tabSize: 4,
            automaticLayout: true,
            padding: { top: 10 },
            fontLigatures: true,
          }}
          loading={<div className="p-4 text-sm text-muted">Loading editor…</div>}
        />
      </div>

      {/* Custom input + output */}
      <div className="grid shrink-0 gap-3 border-t border-border p-3 sm:grid-cols-2">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted">
            Custom input (paste a sample)
          </label>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={5}
            spellCheck={false}
            className="mt-1 w-full rounded-md border border-border bg-surface-2 p-2 font-mono text-xs outline-none focus:border-accent"
            placeholder="stdin…"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted">Output</label>
          <div className="mt-1 max-h-32 min-h-[7.5rem] overflow-auto rounded-md border border-border bg-surface-2 p-2 font-mono text-xs">
            {!result && <span className="text-muted">Run your code to see output.</span>}
            {result?.error && <span className="text-wa">{result.error}</span>}
            {result && !result.error && (
              <>
                <div
                  className="mb-1 font-sans text-[11px] font-medium"
                  style={{ color: result.ok ? "var(--ac)" : "var(--wa)" }}
                >
                  {result.stage === "compile" && !result.ok
                    ? "Compilation Error"
                    : result.ok
                      ? "Finished (exit 0)"
                      : `Exited ${result.code ?? ""}${result.signal ? ` (${result.signal})` : ""}`}
                </div>
                {result.stdout && (
                  <pre className="whitespace-pre-wrap text-foreground">{result.stdout}</pre>
                )}
                {result.stderr && (
                  <pre className="whitespace-pre-wrap text-wa">{result.stderr}</pre>
                )}
                {!result.stdout && !result.stderr && (
                  <span className="text-muted">(no output — did your program print anything?)</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
