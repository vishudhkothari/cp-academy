export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-2.5">
        <div className="skeleton h-5 w-5 rounded-full" />
        <div className="skeleton h-4 w-48" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="space-y-3 border-r border-border p-6 lg:w-1/2">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-11/12" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-3 w-3/4" />
        </div>
        <div className="p-3 lg:w-1/2">
          <div className="skeleton h-full min-h-[60vh] w-full" />
        </div>
      </div>
    </div>
  );
}
