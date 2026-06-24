import Link from "next/link";
import { saveRoadmapItem, cycleRoadmapStatus, deleteRoadmapItem } from "@/app/actions";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

const CATS = ["Hub", "Marketing", "Process", "Automation", "Training", "Analytics", "Other"];
const STATUS: Record<string, { label: string; pill: string; dot: string }> = {
  todo: { label: "To do", pill: "bg-slate-200 text-slate-600", dot: "bg-slate-300" },
  doing: { label: "In progress", pill: "bg-amber-100 text-amber-800", dot: "bg-amber-500" },
  done: { label: "Done", pill: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" },
};

export default async function RoadmapPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!canAccessCSuite(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const items = await db.roadmapItem.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const groups: { key: string; items: typeof items }[] = [
    { key: "doing", items: items.filter((i) => i.status === "doing") },
    { key: "todo", items: items.filter((i) => i.status === "todo") },
    { key: "done", items: items.filter((i) => i.status === "done") },
  ];
  const done = items.filter((i) => i.status === "done").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺 Roadmap"
        subtitle="Everything the war room still needs — click a status dot to advance it (to do → in progress → done)."
        accent="bg-brand-gold"
        right={<span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">{done}/{items.length} done · {pct}%</span>}
      />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}

      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-2 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>

      {groups.map((g) => g.items.length > 0 && (
        <div key={g.key}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${STATUS[g.key].dot}`} />{STATUS[g.key].label} ({g.items.length})</h3>
          <div className="space-y-2">
            {g.items.map((it) => (
              <Card key={it.id} className={`p-3 ${it.status === "done" ? "opacity-70" : ""}`}>
                <div className="flex items-start gap-2">
                  <form action={cycleRoadmapStatus}>
                    <input type="hidden" name="id" value={it.id} />
                    <button title="Advance status" className={`mt-0.5 h-5 w-5 shrink-0 rounded-full ${STATUS[it.status].dot} ring-2 ring-white hover:opacity-80`} />
                  </form>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold text-slate-800 ${it.status === "done" ? "line-through" : ""}`}>{it.title}</span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{it.category}</span>
                    </div>
                    {it.detail && <p className="mt-0.5 text-xs text-slate-500">{it.detail}</p>}
                  </div>
                  <details className="shrink-0">
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-300 hover:text-brand-navy">edit</summary>
                    <form action={saveRoadmapItem} className="mt-2 grid grid-cols-1 gap-2 sm:w-80">
                      <input type="hidden" name="id" value={it.id} />
                      <label><span className={labelCls}>Title</span><input name="title" defaultValue={it.title} className={inputCls} required /></label>
                      <label><span className={labelCls}>Detail</span><input name="detail" defaultValue={it.detail} className={inputCls} /></label>
                      <div className="grid grid-cols-3 gap-2">
                        <label><span className={labelCls}>Category</span><select name="category" defaultValue={it.category} className={inputCls}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></label>
                        <label><span className={labelCls}>Status</span><select name="status" defaultValue={it.status} className={inputCls}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select></label>
                        <label><span className={labelCls}>Sort</span><input name="sortOrder" type="number" defaultValue={it.sortOrder} className={inputCls} /></label>
                      </div>
                      <div className="flex gap-2"><button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-700">Save</button></div>
                    </form>
                    <form action={deleteRoadmapItem} className="mt-1"><input type="hidden" name="id" value={it.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">Delete</button></form>
                  </details>
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">+ Add to the roadmap</h3>
        <form action={saveRoadmapItem} className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <input name="title" placeholder="What needs to get built / done?" className={`${inputCls} sm:col-span-3`} required />
          <select name="category" defaultValue="Other" className={`${inputCls} sm:col-span-1`}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
          <select name="status" defaultValue="todo" className={`${inputCls} sm:col-span-1`}><option value="todo">To do</option><option value="doing">In progress</option><option value="done">Done</option></select>
          <button className="rounded-lg bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 sm:col-span-1">Add</button>
        </form>
      </Card>
    </div>
  );
}
