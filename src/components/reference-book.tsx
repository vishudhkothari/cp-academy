"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Copy, Check, X } from "lucide-react";
import { createTemplate, deleteTemplate } from "@/app/actions";

type Template = {
  id: string;
  title: string;
  language: string;
  code: string;
  notes: string | null;
};

export function ReferenceBook({ templates }: { templates: Template[] }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"CPP" | "PYTHON">("CPP");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (!code.trim()) return;
    start(async () => {
      await createTemplate({ title, language, code, notes });
      setAdding(false);
      setTitle("");
      setCode("");
      setNotes("");
      setLanguage("CPP");
    });
  }

  function copy(t: Template) {
    navigator.clipboard.writeText(t.code).then(() => {
      setCopied(t.id);
      setTimeout(() => setCopied(null), 1500);
    });
  }

  return (
    <div>
      <div className="flex justify-end">
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90"
          >
            <Plus size={15} /> New entry
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. Dijkstra, Mod inverse, Sparse table)"
              className="flex-1 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as "CPP" | "PYTHON")}
              className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="CPP">C++</option>
              <option value="PYTHON">Python</option>
            </select>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="// paste your template / snippet"
            rows={8}
            spellCheck={false}
            className="mt-2 w-full rounded-md border border-border bg-surface-2 p-2.5 font-mono text-xs outline-none focus:border-accent"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes / when to use it (optional)"
            className="mt-2 w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setAdding(false)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
            >
              <X size={14} /> Cancel
            </button>
            <button
              onClick={save}
              disabled={pending || !code.trim()}
              className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-3">
        {templates.length === 0 && !adding && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted">
            Your reference is empty. Add templates and snippets as you learn them —
            the paper calls this one of the highest-leverage habits.
          </div>
        )}
        {templates.map((t) => (
          <div key={t.id} className="rounded-lg border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t.title}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
                  {t.language === "CPP" ? "C++" : "Python"}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => copy(t)}
                  title="Copy"
                  className="rounded-md p-1.5 text-muted hover:text-foreground"
                >
                  {copied === t.id ? <Check size={14} className="text-ac" /> : <Copy size={14} />}
                </button>
                <button
                  onClick={() => start(() => deleteTemplate(t.id))}
                  title="Delete"
                  className="rounded-md p-1.5 text-muted hover:text-wa"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {t.notes && <div className="mt-1 text-xs text-muted">{t.notes}</div>}
            <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-surface-2 p-2.5 font-mono text-xs">
              {t.code}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
