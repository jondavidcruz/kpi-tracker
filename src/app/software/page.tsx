import { saveSoftware, deleteSoftware, clearSecret } from "@/app/actions";
import { getCurrentUser, isAdmin, isManager, canCurateSoftware } from "@/lib/auth";
import { vaultConfigured } from "@/lib/crypto";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import RevealSecret from "@/components/RevealSecret";
import SoftwareControls from "@/components/SoftwareControls";

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

function SoftwareForm({ sw, hasSecret }: { sw?: SW; hasSecret?: boolean }) {
  return (
    <form action={saveSoftware} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {sw && <input type="hidden" name="id" value={sw.id} />}
      <label><span className={labelCls}>Software name</span><input name="name" defaultValue={sw?.name ?? ""} placeholder="GoHighLevel" className={inputCls} required /></label>
      <label><span className={labelCls}>Category</span><select name="category" defaultValue={sw?.category ?? "Other"} className={inputCls}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
      <label><span className={labelCls}>MFA enabled?</span><select name="mfa" defaultValue={sw?.mfa ?? ""} className={inputCls}><option value="">—</option><option value="on">On</option><option value="off">Off</option></select></label>
      <label className="sm:col-span-2"><span className={labelCls}>Login URL</span><input name="url" defaultValue={sw?.url ?? ""} placeholder="https://app.gohighlevel.com" className={inputCls} /></label>
      <label><span className={labelCls}>Login email / username</span><input name="loginEmail" defaultValue={sw?.loginEmail ?? ""} placeholder="team@freedom-offers.com" className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>🔒 Password (stored encrypted — leave blank to keep current)</span><input type="password" name="secret" autoComplete="new-password" placeholder={hasSecret ? "•••••• saved — type to replace" : "type to store securely"} className={inputCls} /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Or — where the password lives elsewhere (vault reference)</span><input name="vaultRef" defaultValue={sw?.vaultRef ?? ""} placeholder="Bitwarden › Acquisitions › GoHighLevel" className={inputCls} /></label>
      <label><span className={labelCls}>Vault link (optional)</span><input name="vaultUrl" defaultValue={sw?.vaultUrl ?? ""} placeholder="https://…" className={inputCls} /></label>
      <label><span className={labelCls}>Account owner</span><input name="owner" defaultValue={sw?.owner ?? ""} placeholder="Jon" className={inputCls} /></label>
      <label className="sm:col-span-2"><span className={labelCls}>Who has access (one per line / comma — controls who can reveal)</span><input name="accessList" defaultValue={sw?.accessList ?? ""} placeholder="Michelle, Ethan, Marie" className={inputCls} /></label>
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

export default async function SoftwarePage({ searchParams }: { searchParams: Promise<{ saved?: string; novault?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const owner = isAdmin(me);
  const manager = isManager(me);
  const canEdit = canCurateSoftware(me); // owner + managers + named curators (Sharyn)
  const meName = me.name.toLowerCase();
  const configured = vaultConfigured();

  const [list, recent] = await Promise.all([
    db.software.findMany({ where: { active: true }, orderBy: [{ name: "asc" }] }),
    owner ? db.secretAccess.findMany({ orderBy: { viewedAt: "desc" }, take: 10 }) : Promise.resolve([]),
  ]);
  const withSecret = new Set(list.filter((s) => s.secret).map((s) => s.id));

  const byCat = new Map<string, SW[]>();
  for (const s of list) {
    const arr = byCat.get(s.category) ?? [];
    arr.push(s as SW);
    byCat.set(s.category, arr);
  }
  const cats = CATEGORIES.filter((c) => byCat.has(c));
  const fmtWhen = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

  return (
    <div className="space-y-5">
      <SectionTitle title="🔑 Software & Logins" subtitle="Every tool we use, the login, and the password — stored encrypted. Only people with access can reveal one." accent="bg-brand-gold" />

      <Card className="border-l-4 border-amber-300 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">
          <strong>How this works:</strong> passwords are stored <strong>encrypted</strong>. Click <strong>Reveal</strong> to copy one (you must be on the tool&apos;s access list; every reveal is logged).
          This is for <strong>software logins only</strong> — never bank or financial credentials.
        </p>
      </Card>

      {owner && !configured && (
        <Card className="border-l-4 border-red-300 bg-red-50 p-4">
          <p className="text-sm text-red-900">
            <strong>Vault key not set up.</strong> To store passwords in-portal, generate a key and add it to Vercel:
            <br />1) Run <code className="rounded bg-white px-1">openssl rand -base64 32</code> 2) In Vercel → your project → Settings → Environment Variables, add <code className="rounded bg-white px-1">VAULT_KEY</code> = that value (Production) 3) Redeploy.
            Until then you can still record a vault reference instead of a stored password.
          </p>
        </Card>
      )}

      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.novault && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">Set up the VAULT_KEY (above) before storing a password.</div>}

      {/* Quick add — the simple path: just name + login + password */}
      {canEdit && (
        <Card className="border-l-4 border-brand-gold bg-white p-5">
          <h3 className="mb-1 text-sm font-bold text-slate-700">⚡ Quick add a login</h3>
          <p className="mb-3 text-xs text-slate-500">Just the basics — it&apos;s encrypted on save. Add the category, cost, and access list later by editing it.</p>
          <form action={saveSoftware} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input name="name" placeholder="Software (e.g. GoHighLevel)" className={`${inputCls} sm:col-span-2`} required />
            <input name="url" placeholder="Login URL (optional)" className={`${inputCls} sm:col-span-2`} />
            <input name="loginEmail" placeholder="Username / email" className={`${inputCls} sm:col-span-2`} autoComplete="off" />
            <input type="password" name="secret" placeholder="Password" autoComplete="new-password" className={`${inputCls} sm:col-span-2`} />
            <div className="sm:col-span-4"><button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save login securely</button></div>
          </form>
        </Card>
      )}

      {list.length === 0 && !canEdit && <Card className="p-10 text-center text-slate-400">No software added yet.</Card>}

      {list.length > 0 && <SoftwareControls categories={cats} />}
      <div data-sw-empty style={{ display: "none" }}>
        <Card className="p-8 text-center text-slate-400">No logins match your search.</Card>
      </div>

      {cats.map((cat) => (
        <div key={cat} data-sw-group={cat}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${CAT_COLOR[cat]}`}>{cat}</span>
            <span className="text-xs font-semibold text-slate-400"><span data-sw-count>{byCat.get(cat)!.length}</span></span>
          </h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {byCat.get(cat)!.map((s) => {
              const hasSecret = withSecret.has(s.id);
              const names = s.accessList.split(/[\n,]/).map((x) => x.trim().toLowerCase()).filter(Boolean);
              const canReveal = manager || names.includes(meName);
              const hay = [s.name, s.loginEmail, s.owner, s.category, s.plan, s.notes, s.accessList, s.vaultRef]
                .filter(Boolean).join(" ").toLowerCase();
              return (
                <div key={s.id} data-sw-card data-search={hay}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-slate-800">{s.name}</span>
                    {s.mfa === "on" && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">MFA on</span>}
                    {s.mfa === "off" && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">No MFA</span>}
                    {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs font-semibold text-brand-navy hover:underline">Open login ↗</a>}
                  </div>

                  <div className="mt-2 space-y-1 text-sm">
                    {s.loginEmail && <div className="text-slate-600"><span className="text-slate-400">Login:</span> <span className="font-mono text-[13px]">{s.loginEmail}</span></div>}
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-slate-400">Password:</span>{" "}
                      {hasSecret
                        ? (canReveal ? <RevealSecret id={s.id} /> : <span className="italic text-slate-400">🔒 not on your access list</span>)
                        : s.vaultUrl
                        ? <a href={s.vaultUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">open in vault ↗</a>
                        : s.vaultRef
                        ? <span className="text-slate-700">{s.vaultRef}</span>
                        : <span className="italic text-slate-400">not stored yet</span>}
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

                  {canEdit && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-brand-navy">Edit / delete</summary>
                      <div className="mt-2"><SoftwareForm sw={s} hasSecret={hasSecret} /></div>
                      <div className="mt-1 flex gap-3">
                        {hasSecret && <form action={clearSecret}><input type="hidden" name="id" value={s.id} /><button className="text-[11px] font-medium text-slate-400 hover:text-red-600">Remove stored password</button></form>}
                        <form action={deleteSoftware}><input type="hidden" name="id" value={s.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Delete entry</button></form>
                      </div>
                    </details>
                  )}
                </Card>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {canEdit && (
        <details className="rounded-xl ring-1 ring-slate-200">
          <summary className="cursor-pointer rounded-xl bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700">➕ Add with all details (category, cost, access, MFA…)</summary>
          <div className="p-5"><SoftwareForm /></div>
        </details>
      )}

      {owner && recent.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-500 hover:text-brand-navy">🔓 Recent password reveals ({recent.length})</summary>
          <div className="mt-2 space-y-1">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-700">{r.viewedBy}</span> revealed <span className="font-medium text-slate-700">{r.softwareName}</span>
                <span className="ml-auto text-slate-400">{fmtWhen(r.viewedAt)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
