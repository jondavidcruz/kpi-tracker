// 🛠 Owner/manager form-builder (Jon 2026-10-27, #20): add your own columns, dropdowns
// and emojis to the Home & Land Details forms. Custom fields are APPENDED to the base
// form everywhere (quick-view + full lead page) and saved like any other answer.
import { getCurrentUser, isOwner, isManager } from "@/lib/auth";
import { CRM_FORMS, type FormField } from "@/lib/crm-forms";
import { loadCustomFieldsRaw } from "@/lib/crm-forms-store";
import { addCustomFieldAction, deleteCustomFieldAction } from "@/app/actions";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const EDITABLE = [
  { key: "property", name: "Home Details", emoji: "🏡" },
  { key: "land", name: "Land Details", emoji: "🏞" },
];

export default async function FormBuilderPage({ searchParams }: { searchParams: Promise<{ added?: string; deleted?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!isOwner(me) && !isManager(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-2 text-sm text-slate-500">The form builder is limited to managers and the owner.</p>
      </div>
    );
  }
  const custom = await loadCustomFieldsRaw();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">🛠 Home / Land Details form builder</h1>
        <p className="mt-1 text-sm text-slate-500">Add your own fields (text, long text, or a dropdown) with an emoji. They appear at the bottom of the matching form on every lead, and save like any other answer.</p>
      </div>
      {sp.added && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">✓ Field added.</div>}
      {sp.deleted && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 ring-1 ring-amber-200">✓ Field removed (existing answers stay in the data).</div>}
      {sp.err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">⚠️ Couldn&apos;t add that — a dropdown needs at least one option.</div>}

      {EDITABLE.map((f) => {
        const base = (CRM_FORMS.find((x) => x.key === f.key)?.fields ?? []) as FormField[];
        const mine = Array.isArray(custom[f.key]) ? custom[f.key] : [];
        return (
          <Card key={f.key} className="p-4">
            <div className="mb-2 text-sm font-bold text-slate-800">{f.emoji} {f.name}</div>

            {mine.length > 0 && (
              <div className="mb-3">
                <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-violet-500">Your custom fields</div>
                <div className="space-y-1">
                  {mine.map((cf) => {
                    const c = cf as { key?: string; label?: string; type?: string; options?: string[] };
                    return (
                      <div key={String(c.key)} className="flex items-center justify-between gap-2 rounded-lg bg-violet-50/60 px-2.5 py-1.5 text-[12px] ring-1 ring-violet-100">
                        <span><b className="text-slate-700">{c.label}</b> <span className="text-slate-400">· {c.type === "select" ? `dropdown (${(c.options ?? []).length})` : c.type}</span></span>
                        <form action={deleteCustomFieldAction}>
                          <input type="hidden" name="formKey" value={f.key} />
                          <input type="hidden" name="key" value={String(c.key)} />
                          <button className="rounded-md px-2 py-0.5 text-[11px] font-bold text-slate-300 hover:text-red-500">✕ remove</button>
                        </form>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <form action={addCustomFieldAction} className="grid grid-cols-12 items-end gap-2 rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
              <input type="hidden" name="formKey" value={f.key} />
              <label className="col-span-2">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Emoji</span>
                <input name="emoji" placeholder="🏷" maxLength={4} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm" />
              </label>
              <label className="col-span-6">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Field name</span>
                <input name="label" required placeholder="e.g. Survey on file?" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <label className="col-span-4">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Type</span>
                <select name="type" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                  <option value="text">Text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Dropdown</option>
                </select>
              </label>
              <label className="col-span-12">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Dropdown options <span className="normal-case text-slate-300">(only for Dropdown — comma or new-line separated)</span></span>
                <input name="options" placeholder="Yes, No, Unknown" className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
              </label>
              <div className="col-span-12">
                <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">＋ Add field to {f.name}</button>
              </div>
            </form>
          </Card>
        );
      })}
    </div>
  );
}
