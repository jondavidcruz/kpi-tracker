// Shown instantly on every page navigation while the server renders, so the app feels
// snappy even on data-heavy pages (the sidebar stays; only this content area swaps).
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Loading">
      <div className="h-8 w-56 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-100 ring-1 ring-slate-200" />
        ))}
      </div>
      <div className="h-5 w-40 rounded bg-slate-200" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-slate-100 ring-1 ring-slate-200" />
        ))}
      </div>
    </div>
  );
}
