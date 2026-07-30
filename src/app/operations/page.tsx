import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { saveResource, deleteResource } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";
import type { Resource } from "@prisma/client";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const lbl = "mb-0.5 block text-[11px] font-semibold text-slate-500";
const CATEGORIES = ["SOPs", "Scripts", "Training", "Onboarding", "Offboarding", "Tools", "Goals / EOS", "General"];

export default async function OperationsPage({ searchParams }: { searchParams: Promise<{ saved?: string; edit?: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">The Operations hub is private to the owner.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const sp = await searchParams;
  const resources = await db.resource.findMany({ where: { category: { not: "__phone_line__" } }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }] });
  const editing = sp.edit ? resources.find((r) => r.id === sp.edit) ?? null : null;

  const byCat = new Map<string, Resource[]>();
  for (const r of resources) {
    if (!byCat.has(r.category)) byCat.set(r.category, []);
    byCat.get(r.category)!.push(r);
  }
  const cats = [...byCat.keys()].sort();

  return (
    <div className="space-y-7">
      <SectionTitle title="🗂 Operations" subtitle="Your private command center — SOPs, scripts, training, onboarding. Owner-only." accent="bg-brand-gold" />
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}

      {/* Add / edit a link */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">{editing ? "Edit link" : "Add a link"}</h3>
        <form action={saveResource} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <label><span className={lbl}>Title</span><input name="title" defaultValue={editing?.title ?? ""} placeholder="e.g. Acquisitions call script" className={inputCls} required /></label>
          <label><span className={lbl}>Category</span>
            <input name="category" defaultValue={editing?.category ?? ""} placeholder="SOPs / Scripts / Training…" list="ops-cats" className={inputCls} />
            <datalist id="ops-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="sm:col-span-2"><span className={lbl}>Link (Google Doc, Notion, Loom, etc.)</span><input name="url" defaultValue={editing?.url ?? ""} placeholder="https://…" className={inputCls} required /></label>
          <label className="sm:col-span-2"><span className={lbl}>Note <span className="font-normal text-slate-400">(optional)</span></span><input name="description" defaultValue={editing?.description ?? ""} placeholder="what this is / when to use it" className={inputCls} /></label>
          <div className="sm:col-span-2 flex gap-2">
            <button className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">{editing ? "Save changes" : "+ Add link"}</button>
            {editing && <Link href="/operations" className="rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100">Cancel</Link>}
          </div>
        </form>
      </Card>

      {/* Links by category */}
      {resources.length === 0 ? (
        <Card className="p-10 text-center text-slate-400">No links yet. Add your SOPs, scripts, and training links above — they&apos;ll group by category here.</Card>
      ) : (
        cats.map((cat) => (
          <section key={cat}>
            <h3 className="mb-2 text-sm font-bold text-slate-700">{cat}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byCat.get(cat)!.map((r) => (
                <Card key={r.id} className="flex flex-col p-4">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-800 hover:text-brand-navy hover:underline">
                    {r.title} ↗
                  </a>
                  {r.description && <p className="mt-1 flex-1 text-sm text-slate-500">{r.description}</p>}
                  <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2 text-xs">
                    <Link href={`/operations?edit=${r.id}`} className="font-semibold text-slate-500 hover:text-slate-800">Edit</Link>
                    <form action={deleteResource}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="font-semibold text-slate-400 hover:text-red-600">Delete</button>
                    </form>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ))
      )}

      <p className="text-center text-xs text-slate-400">Only you can see this section. Links open in a new tab. (Native trackers — Expenses/P&L, EOS Rocks — can slot in here next.)</p>
    </div>
  );
}
