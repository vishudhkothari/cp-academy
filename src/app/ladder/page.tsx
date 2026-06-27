import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { ratingColor } from "@/lib/utils";
import { getRatingLadder } from "@/lib/engine/ladder";
import { SolveToggle } from "@/components/solve-toggle";

export const dynamic = "force-dynamic";

export default async function LadderPage() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  const rungs = await getRatingLadder(prisma, user?.id ?? null, { perRating: 25 });

  const total = rungs.reduce((s, r) => s + r.total, 0);
  const solved = rungs.reduce((s, r) => s + r.solved, 0);
  const firstIncomplete = rungs.find((r) => r.solved < r.total)?.rating;

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Rating Ladder</h1>
        <div className="text-sm text-muted">
          {solved}/{total} solved
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">
        The canonical (most-solved) problems at each rating, 800 → 2100, across
        Codeforces <em>and</em> AtCoder. A rating climb in the CP-31 spirit — but
        multi-source, past Candidate Master, and wired into your mastery and
        readiness. Pick your level and grind it until it&apos;s easy.
      </p>

      <div className="mt-8 space-y-3">
        {rungs.map((rung) => (
          <details
            key={rung.rating}
            open={rung.rating === firstIncomplete}
            className="group rounded-lg border border-border bg-surface"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{ color: ratingColor(rung.rating) }}
                >
                  {rung.rating}
                </span>
                <span className="text-xs text-muted">{rung.total} problems</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-ac"
                    style={{ width: `${rung.total ? (rung.solved / rung.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs tabular-nums text-muted">
                  {rung.solved}/{rung.total}
                </span>
              </div>
            </summary>
            <ol className="border-t border-border">
              {rung.problems.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-2 text-sm last:border-0 hover:bg-surface-2/40"
                >
                  <span className="w-5 text-center text-xs text-muted tabular-nums">{i + 1}</span>
                  <span className="w-4 text-center">
                    <SolveToggle problemId={p.id} solved={p.solved} size={15} />
                  </span>
                  <Link href={`/problems/${p.id}`} className="flex-1 truncate hover:text-accent">
                    {p.title}
                  </Link>
                  <span className="text-xs text-muted">{p.source === "ATCODER" ? "AtCoder" : "CF"}</span>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted hover:text-foreground"
                    title="Open original"
                  >
                    <ExternalLink size={13} />
                  </a>
                </li>
              ))}
              {rung.problems.length === 0 && (
                <li className="px-4 py-3 text-xs text-muted">
                  No problems synced at this rating yet — run a sync.
                </li>
              )}
            </ol>
          </details>
        ))}
      </div>
    </div>
  );
}
