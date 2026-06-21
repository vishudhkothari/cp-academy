"use client";

import { useState } from "react";
import { ExternalLink, Eye } from "lucide-react";
import { AxisEditor } from "./axis-editor";
import { ReflectionForm } from "./reflection-form";
import { CoachLadder } from "./coach-ladder";

type Reflection = {
  id: string;
  stuckLevel: number;
  bugType: string | null;
  note: string;
};

const LEVEL_LABELS = [
  "",
  "Solved within time",
  "Solved after (upsolved)",
  "Knew it — had bugs",
  "Knew it — couldn't implement",
  "Knew the technique — couldn't connect it",
  "Didn't know the technique",
];

type Tab = "statement" | "coach" | "reflect" | "history";

export function ProblemTabs({
  problemId,
  title,
  statementHtml,
  url,
  obs,
  tech,
  impl,
  solved,
  reflections,
  coachLevel,
}: {
  problemId: string;
  title: string;
  statementHtml: string | null;
  url: string;
  obs: number | null;
  tech: number | null;
  impl: number | null;
  solved: boolean;
  reflections: Reflection[];
  coachLevel: number;
}) {
  const [tab, setTab] = useState<Tab>("statement");

  const TABS: { key: Tab; label: string }[] = [
    { key: "statement", label: "Statement" },
    { key: "coach", label: "Coach" },
    { key: "reflect", label: "Reflect" },
    { key: "history", label: `History${reflections.length ? ` (${reflections.length})` : ""}` },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t.key === "coach" && coachLevel >= 6 && <Eye size={12} className="text-warn" />}
            {t.label}
          </button>
        ))}
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted hover:text-accent"
          >
            original <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "statement" &&
          (statementHtml ? (
            <div className="statement" dangerouslySetInnerHTML={{ __html: statementHtml }} />
          ) : (
            <div className="text-sm text-muted">
              Couldn&apos;t render the statement here.{" "}
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                Open the original ↗
              </a>
            </div>
          ))}

        {tab === "coach" && (
          <CoachLadder problemId={problemId} title={title} url={url} initialLevel={coachLevel} />
        )}

        {tab === "reflect" && (
          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-medium">3-axis difficulty</h3>
              <p className="mt-1 text-xs text-muted">
                Rate the load this problem put on each skill — feeds your mastery analytics.
              </p>
              <div className="mt-3">
                <AxisEditor problemId={problemId} obs={obs} tech={tech} impl={impl} />
              </div>
            </section>
            <section>
              <h3 className="text-sm font-medium">Reflect</h3>
              <p className="mt-1 text-xs text-muted">
                The paper&apos;s 6-level ladder — where did you get stuck?
              </p>
              <div className="mt-3 max-w-sm">
                <ReflectionForm problemId={problemId} solved={solved} />
              </div>
            </section>
          </div>
        )}

        {tab === "history" &&
          (reflections.length === 0 ? (
            <div className="text-sm text-muted">No reflections yet.</div>
          ) : (
            <ul className="space-y-3 text-sm">
              {reflections.map((r) => (
                <li key={r.id} className="border-l-2 border-border pl-3">
                  <div className="text-xs text-muted">
                    L{r.stuckLevel} · {LEVEL_LABELS[r.stuckLevel] ?? ""}
                    {r.bugType ? ` · ${r.bugType.toLowerCase().replace("_", " ")}` : ""}
                  </div>
                  {r.note && <div className="mt-0.5">{r.note}</div>}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
