export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="skeleton h-7 w-44" />
      <div className="skeleton mt-3 h-3 w-2/3" />
      <div className="skeleton mt-6 h-20 w-full rounded-xl" />
      <div className="mt-8 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
