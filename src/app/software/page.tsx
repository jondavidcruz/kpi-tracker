import { saveSoftware, deleteSoftware } from "@/app/actions";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

const CATEGORIES = ["CRM", "Dialer", "Marketing", "Data", "Finance", "Comms", "Productivity", "Other"];
const CAT_COLOR: Record<string, string> = {
  CRM: "bg-sky-100 text-sky-700", Dialer: "bg-violet-100 text-violet-700", Marketing: "bg-amber-100 text-amber-700",
  Data: "bg-teal-100 text-teal-700", Finance: "bg-emerald-100 text-emerald-700", Comms: "bg-indigo-100 text-indigo-700",
  Productivity: "bg-slate-200 text-slate-700", Other: "bg-slate-100 text-slate-600",
};

type SW = {
  id: string; name: string; category: string; url: string; loginEmail: string; vaultRef: string; vaultUrl: string;
  mfa: string; owner: string; accessList: string; plan: string; monthlyCost: string; billingCycle: string;
  renewalDate: string; notes: string; sortOrder: number;
};

function SoftwareForm({ sw }: { sw?: SW }) {
  return (
    <form action={saveSoftware} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {sw && <input type="hidden" name="id" value={sw.id} />}
      <label><span className={labelCls}>Software name</span><input name="name" defaultValue={sw?.name ?? ""} placeholder="GoHighLevel" className={inputCls} required /></label>
      <label><span className={labelCls}>Category</span><select name="category" defaultValue={sw?.category ?? "Other"} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label><span className={labelCls}>MFA enabled?</span><select name="mfa" defaultValue={sw?.mfa ?? ""} className={inputCls}><option value="">—</option><option value="on">On</option><option value="off">Off</option></select></label>
      <label className="sm:col-span-2"><span className={labelCls}>Login URL</span><input name="url" defaultValue={sw?.url ?? ""} placeholder="https://app.gohighlevel.com" className={inputCls} /></label>
      <label><span className={labelCls}>Login email / username</span><input name="loginEmail" defaultValue={sw?.loginEmail ?? ""} placeholder="team@freedom-offers.com" className={inputCls} /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Where the password lives (vault reference)</span><input name="vaultRef" defaultValue={sw?.vaultRef ?? ""} placeholder="Bitwarden › Acquisitions › GoHighLevel" className={inputCls} /></label>
      <label><span className={labelCls}>Vault link (optional)</span><input name="vaultUrl" defaultValue={sw?.vaultUrl ?? ""} placeholder="https://vault.bitwarden.com/…" className={inputCls} /></label>
      <label><span className={labelCls}>Account owner</span><input name="owner" defaultValue={sw?.owner ?? ""} placeholder="Jon" className={inputCls} /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Who has access (one per line / comma)</span><input name="accessList" defaultValue={sw?.accessList ?? ""} placeholder="Michelle, Ethan, Marie" className={inputCls} /></label>
      <label><span className={labelCls}>Plan</span><input name="plan" defaultValue={sw?.plan ?? ""} placeholder="Agency Pro" className={inputCls} /></label>
      <label><span className={labelCls}>Monthly cost</span><input name="monthlyCost" defaultValue={sw?.monthlyCost ?? ""} placeholder="$297" className={inputCls} /></label>
      <label><span className={labelCls}>Billing</span><select name="billingCycle" defaultValue={sw?.billingCycle ?? ""} className={inputCls}><option value="">—</option><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
      <label><span className={labelCls}>Renewal date</span><input name="renewalDate" type="date" defaultValue={sw?.renewalDate ?? ""} className={inputCls} /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Notes</span><input name="notes" defaultValue={sw?.notes ?? ""} className={inputCls} /></label>
      <label><span className={labelCls}>Sort order</span><input name="sortOrder" type="number" defaultValue={sw?.sortOrder ?? 0} className={inputCls} /></label>
      <div className="sm:col-span-3"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">{sw ? "Save" : "Add software"}</button></div>
    </form>
  );
}

export default async function SoftwarePage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const owner = isAdmin(me);
  const list = await db.software.findMany({ where: { active: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }] });

  const byCat = new Map<string, SW[]>();
  for (const s of list) {
    const arr = byCat.get(s.category) ?? [];
    arr.push(s as SW);
    byCat.set(s.category, arr);
  }
  const cats = CATEGORIES.filter((c) => byCat.has(c));

  return (
    <div className="space-y-5">
      <SectionTitle title="🔑 Software & Logins" subtitle="Every tool we use and where to find its login. Passwords live in our password manager — never here." accent="bg-brand-gold" />

      <Card className="border-l-4 border-amber-300 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          <strong>How this works:</strong> this directory tells you the login URL, the username, and <strong>where the password is stored in our password manager</strong>.
          The actual passwords are <strong>never</strong> kept here — open the vault link (or the password manager app) to copy a password.
          Never type a password into this page or share one in chat.
        </p>
      </Card>

      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}

      {list.length === 0 && !owner && <Card className="p-10 text-center text-slate-400">No software added yet.</Card>}

      {cats.map((cat) => (
        <div key={cat}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${CAT_COLOR[cat]}`}>{cat}</span></h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {byCat.get(cat)!.map((s) => (
              <Card key={s.id} className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-slate-800">{s.name}</span>
                  {s.mfa === "on" && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">MFA on</span>}
                  {s.mfa === "off" && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">No MFA</span>}
                  {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-semibold text-brand-navy hover:underline">Open login ↗</a>}
                </div>

                <div className="mt-2 space-y-1 text-sm">
                  {s.loginEmail && <div className="text-slate-600"><span className="text-slate-400">Login:</span> <span className="font-mono text-[13px]">{s.loginEmail}</span></div>}
                  <div className="text-slate-600">
                    <span className="text-slate-400">Password:</span>{" "}
                    {s.vaultUrl
                      ? <a href={s.vaultUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">open in vault ↗</a>
                      : s.vaultRef
                      ? <span className="text-slate-700">{s.vaultRef}</span>
                      : <span className="italic text-slate-400">in the password manager</span>}
                  </div>
                  {s.owner && <div className="text-slate-500"><span className="text-slate-400">Owner:</span> {s.owner}</div>}
                  {s.accessList && <div className="text-slate-500"><span className="text-slate-400">Access:</span> {s.accessList}</div>}
                  {s.notes && <div className="text-slate-500">{s.notes}</div>}
                </div>

                {owner && (s.plan || s.monthlyCost || s.renewalDate) && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2 text-[11px]">
                    {s.plan && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{s.plan}</span>}
                    {s.monthlyCost && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{s.monthlyCost}{s.billingCycle ? `/${s.billingCycle === "annual" ? "yr" : "mo"}` : ""}</span>}
                    {s.renewalDate && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">renews {s.renewalDate}</span>}
                  </div>
                )}

                {owner && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-brand-navy">Edit / delete</summary>
                    <div className="mt-2"><SoftwareForm sw={s} /></div>
                    <form action={deleteSoftware} className="mt-1"><input type="hidden" name="id" value={s.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Delete</button></form>
                  </details>
                )}
              </Card>
            ))}
          </div>
        </div>
      ))}

      {owner && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold text-slate-700">Add software</h3>
          <SoftwareForm />
        </Card>
      )}
    </div>
  );
}
