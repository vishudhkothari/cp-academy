import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { ratingColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SP = Record<string, string | undefined>;

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

const AXIS_FIELDS = [
  { field: "obsDifficulty", color: "var(--obs)" },
  { field: "techDifficulty", color: "var(--tech)" },
  { field: "implDifficulty", color: "var(--impl)" },
] as const;

function AxisDots({
  obs,
  tech,
  impl,
}: {
  obs: number | null;
  tech: number | null;
  impl: number | null;
}) {
  const vals = { obsDifficulty: obs, techDifficulty: tech, implDifficulty: impl };
  return (
    <div className="flex items-center gap-2">
      {AXIS_FIELDS.map(({ field, color }) => {
        const v = vals[field as keyof typeof vals];
        return (
          <span key={field} className="flex items-center gap-0.5" title={field}>
            <span className="h-2 w-2 rounded-full" style={{ background: color, opacity: v ? 1 : 0.2 }} />
            <span className="text-[11px] tabular-nums" style={{ color: v ? color : "var(--muted)" }}>
              {v ?? "·"}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const topicSlug = sp.topic || "";
  const minR = num(sp.min);
  const maxR = num(sp.max);
  const status = sp.status || "all";
  const page = Math.max(1, num(sp.page) ?? 1);

  const user = await prisma.user.findFirst({ select: { id: true } });
  const solved = user
    ? await prisma.submission.findMany({
        where: { userId: user.id, verdict: "AC" },
        distinct: ["problemId"],
        select: { problemId: true },
      })
    : [];
  const solvedSet = new Set(solved.map((s) => s.problemId));

  const where: Prisma.ProblemWhereInput = { source: "CODEFORCES" };
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (topicSlug) where.topic = { slug: topicSlug };
  if (minR !== undefined || maxR !== undefined)
    where.sourceRating = { gte: minR, lte: maxR };
  if (status === "solved") where.id = { in: [...solvedSet] };
  if (status === "unsolved" && solvedSet.size)
    where.id = { notIn: [...solvedSet] };

  const [topics, total, problems] = await Promise.all([
    prisma.topic.findMany({
      orderBy: [{ month: "asc" }, { name: "asc" }],
      select: { slug: true, name: true, month: true },
    }),
    prisma.problem.count({ where }),
    prisma.problem.findMany({
      where,
      orderBy: [{ sourceRating: { sort: "asc", nulls: "last" } }, { title: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { topic: { select: { name: true, slug: true } } },
    }),
  ]);

  const pages = Math.ceil(total / PAGE_SIZE);

  const qs = (overrides: SP) => {
    const p = new URLSearchParams();
    const merged: SP = { q, topic: topicSlug, min: sp.min, max: sp.max, status, page: String(page), ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/problems?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
        <div className="text-sm text-muted">{total.toLocaleString()} match</div>
      </div>

      <form className="mt-5 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <Field label="Search">
          <input
            name="q"
            defaultValue={q}
            placeholder="title…"
            className="w-44 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          />
        </Field>
        <Field label="Topic">
          <select
            name="topic"
            defaultValue={topicSlug}
            className="w-52 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent"
          >
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>
                M{t.month} · {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rating">
          <div className="flex items-center gap-1">
            <input name="min" defaultValue={sp.min ?? ""} placeholder="800" className="w-16 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent" />
            <span className="text-muted">–</span>
            <input name="max" defaultValue={sp.max ?? ""} placeholder="3500" className="w-16 rounded-md border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent" />
          </div>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={status} className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm outline-none focus:border-accent">
            <option value="all">All</option>
            <option value="solved">Solved</option>
            <option value="unsolved">Unsolved</option>
          </select>
        </Field>
        <button className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground hover:opacity-90">
          Filter
        </button>
      </form>

      <div className="mt-5 overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-muted">
            <tr className="text-left">
              <th className="w-10 px-3 py-2.5 font-medium"></th>
              <th className="px-3 py-2.5 font-medium">Problem</th>
              <th className="px-3 py-2.5 font-medium">Topic</th>
              <th className="px-3 py-2.5 font-medium">Rating</th>
              <th className="px-3 py-2.5 font-medium" title="Observation · Technique · Implementation">
                O · T · I
              </th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr key={p.id} className="border-t border-border hover:bg-surface/60">
                <td className="px-3 py-2.5 text-center">
                  {solvedSet.has(p.id) ? (
                    <span className="text-ac">✓</span>
                  ) : (
                    <span className="text-muted/40">·</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                    <span className="text-muted">{p.externalId}</span> {p.title}
                  </a>
                </td>
                <td className="px-3 py-2.5 text-muted">{p.topic?.name ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums font-medium" style={{ color: ratingColor(p.sourceRating) }}>
                  {p.sourceRating ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <AxisDots obs={p.obsDifficulty} tech={p.techDifficulty} impl={p.implDifficulty} />
                </td>
              </tr>
            ))}
            {problems.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-muted">
                  No problems match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <a
            href={qs({ page: String(Math.max(1, page - 1)) })}
            className={`rounded-md border border-border px-3 py-1.5 ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-surface"}`}
          >
            ← Prev
          </a>
          <span className="text-muted">
            Page {page} of {pages.toLocaleString()}
          </span>
          <a
            href={qs({ page: String(Math.min(pages, page + 1)) })}
            className={`rounded-md border border-border px-3 py-1.5 ${page >= pages ? "pointer-events-none opacity-40" : "hover:bg-surface"}`}
          >
            Next →
          </a>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
