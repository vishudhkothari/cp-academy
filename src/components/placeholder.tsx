export function Placeholder({
  title,
  phase,
  children,
}: {
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-muted">
          {phase}
        </span>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-surface p-6 text-sm text-muted leading-relaxed">
        {children}
      </div>
    </div>
  );
}
