import { restoreProspect } from "@/app/actions";

// Archived buyers list (rule zero: nothing is deleted). Collapsed by default;
// one-click Restore puts a buyer straight back into the live lists.
export default function ArchivedBuyers({
  rows,
}: {
  rows: { id: string; name: string; archivedAt: Date | null; archivedBy: string | null; archiveReason: string | null }[];
}) {
  if (rows.length === 0) return null;
  return (
    <details className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <summary className="cursor-pointer text-sm font-bold text-slate-600">
        🗂 Archived buyers ({rows.length}) <span className="font-normal text-slate-400">— nothing is ever deleted; restore any time</span>
      </summary>
      <div className="mt-3 divide-y divide-slate-200">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
            <span className="font-semibold text-slate-700">{r.name}</span>
            <span className="text-[11px] text-slate-400">
              archived {r.archivedAt ? new Date(r.archivedAt).toLocaleDateString() : ""}
              {r.archivedBy ? ` by ${r.archivedBy}` : ""}{r.archiveReason ? ` · ${r.archiveReason}` : ""}
            </span>
            <form action={restoreProspect} className="ml-auto">
              <input type="hidden" name="id" value={r.id} />
              <button className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700">↩ Restore</button>
            </form>
          </div>
        ))}
      </div>
    </details>
  );
}
