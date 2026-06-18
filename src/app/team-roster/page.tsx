import Link from "next/link";
import { saveTeamProfile, uploadTeamDoc, deleteTeamDoc } from "@/app/actions";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { getAwardBoard, getAiChampions } from "@/lib/awards";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/date";
import { getSettings } from "@/lib/data";
import { positionLabel } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";
import AccountabilityChart from "@/components/AccountabilityChart";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

function yearsBetween(from: string, to: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return "—";
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  if (b < a) return "—";
  const months = Math.floor((b - a) / (1000 * 60 * 60 * 24 * 30.44));
  const y = Math.floor(months / 12), m = months % 12;
  return y > 0 ? `${y}y ${m}m` : `${m}m`;
}
function ageFrom(birthday: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) return "—";
  let age = Number(today.slice(0, 4)) - Number(birthday.slice(0, 4));
  if (today.slice(5) < birthday.slice(5)) age--;
  return String(age);
}

export default async function TeamRosterPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">This section is private to the owner.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const [users, profiles, board, ai, seats, docs] = await Promise.all([
    getAllUsers(),
    db.teamProfile.findMany(),
    getAwardBoard(),
    getAiChampions(),
    db.seat.findMany({ orderBy: { sortOrder: "asc" } }),
    db.teamDoc.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, userId: true, label: true, filename: true, size: true, createdAt: true } }),
  ]);
  const active = users.filter((u) => u.active);
  const byUser = new Map(profiles.map((p) => [p.userId ?? "", p]));
  const docsByUser = new Map<string, typeof docs>();
  for (const d of docs) { const arr = docsByUser.get(d.userId) ?? []; arr.push(d); docsByUser.set(d.userId, arr); }
  const fmtSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-violet-50 px-4 py-3 ring-1 ring-violet-200">
        <SectionTitle
          title="🔒 Team Roster — Private"
          subtitle="Owner-only HR ecosystem: pay, payment details, personal info, tenure & promotion, performance. The team cannot see this."
          accent="bg-violet-500"
        />
        <p className="-mt-1 text-xs font-semibold text-violet-700">👁️ Private — only you (Jon) can open this. Sections marked with 🔒 in the sidebar are owner-only.</p>
      </div>

      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.err && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">{sp.err === "size" ? "That file is over 15MB — compress it and try again." : "Pick a file to upload."}</div>}

      {/* EOS Accountability Chart + GWC */}
      <details open={seats.length > 0} className="rounded-xl ring-1 ring-violet-200">
        <summary className="cursor-pointer rounded-xl bg-violet-50 px-4 py-3">
          <span className="text-sm font-bold text-violet-800">🗂 Accountability Chart</span>
          <span className="ml-2 text-xs text-violet-600">Right person, right seat — the org structure, key roles, and a Gets it / Wants it / Capacity read per seat.</span>
        </summary>
        <div className="p-4">
          <AccountabilityChart seats={seats} />
        </div>
      </details>

      <div className="space-y-4">
        {active.map((u) => {
          const p = byUser.get(u.id);
          const isOwner = u.role === "admin";
          const myDocs = docsByUser.get(u.id) ?? [];
          const wins = board.champions.find((c) => c.rep === u.name)?.wins ?? 0;
          const aiProven = ai.find((c) => c.rep === u.name)?.count ?? 0;
          const tenure = p?.startDate ? yearsBetween(p.startDate, today) : "—";
          const sincePromo = p?.lastPromotion ? yearsBetween(p.lastPromotion, today) : (p?.startDate ? yearsBetween(p.startDate, today) : "—");
          const dueReview = (wins >= 2 || aiProven >= 1) && (sincePromo !== "—" && !sincePromo.startsWith("0y") && sincePromo !== "0m");
          return (
            <Card key={u.id} className="p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-navy text-xs font-bold text-brand-gold-soft">{u.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
                <div className="flex-1">
                  <div className="font-bold text-slate-800">{u.name} {p?.birthday && <span className="text-xs font-normal text-slate-400">· {ageFrom(p.birthday, today)} yrs</span>}</div>
                  <div className="text-xs text-slate-400">{positionLabel(u.position)} · {u.role}</div>
                </div>
                {dueReview && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">⭐️ Review for promotion</span>}
              </div>

              {/* Performance snapshot */}
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Snap label="With us" value={tenure} />
                {!isOwner && <Snap label="Since promotion" value={sincePromo} />}
                <Snap label="Top-perf wins" value={String(wins)} />
                <Snap label="AI proven" value={String(aiProven)} />
              </div>

              {/* Editable HR record */}
              <form action={saveTeamProfile} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="name" value={u.name} />
                <label><span className={labelCls}>Birthday</span><input type="date" name="birthday" defaultValue={p?.birthday ?? ""} className={inputCls} /></label>
                <label><span className={labelCls}>Phone</span><input name="phone" defaultValue={p?.phone ?? ""} className={inputCls} /></label>
                <label><span className={labelCls}>Started with us</span><input type="date" name="startDate" defaultValue={p?.startDate ?? ""} className={inputCls} /></label>
                <label className="sm:col-span-3"><span className={labelCls}>Address</span><input name="address" defaultValue={p?.address ?? ""} className={inputCls} /></label>
                {!isOwner && (
                  <>
                    <label><span className={labelCls}>Last promotion</span><input type="date" name="lastPromotion" defaultValue={p?.lastPromotion ?? ""} className={inputCls} /></label>
                    <label><span className={labelCls}>Pay scale / rate</span><input name="payScale" defaultValue={p?.payScale ?? ""} placeholder="$2,000" className={inputCls} /></label>
                    <label><span className={labelCls}>Pay period</span>
                      <select name="payPeriod" defaultValue={p?.payPeriod ?? ""} className={inputCls}>
                        <option value="">—</option>
                        {["monthly", "biweekly", "weekly", "hourly", "per-deal"].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </label>
                    <label><span className={labelCls}>Pay method</span><input name="payMethod" defaultValue={p?.payMethod ?? "Wise"} placeholder="Wise" className={inputCls} /></label>
                    <label className="sm:col-span-2"><span className={labelCls}>Payment details (Wise / bank) 🔒</span><input name="payDetails" defaultValue={p?.payDetails ?? ""} placeholder="Wise email / account / IBAN…" className={inputCls} /></label>
                  </>
                )}
                <label className="sm:col-span-3"><span className={labelCls}>About them</span><textarea name="about" defaultValue={p?.about ?? ""} rows={2} className={inputCls} /></label>
                {!isOwner && <label className="sm:col-span-3"><span className={labelCls}>Performance & promotion notes</span><textarea name="performance" defaultValue={p?.performance ?? ""} rows={2} className={inputCls} /></label>}
                <div className="sm:col-span-3"><button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">Save</button></div>
              </form>

              {/* Signed agreements & documents */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">📄 Documents (signed agreements)</div>
                {myDocs.length > 0 ? (
                  <ul className="mb-2 space-y-1">
                    {myDocs.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <a href={`/api/team-doc/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-navy hover:underline">📎 {d.label}</a>
                        <span className="text-xs text-slate-400">{d.filename} · {fmtSize(d.size)}</span>
                        <form action={deleteTeamDoc} className="ml-auto"><input type="hidden" name="id" value={d.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Remove</button></form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-2 text-xs text-slate-400">No documents uploaded yet.</p>
                )}
                <form action={uploadTeamDoc} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <input name="label" placeholder="Label (e.g. Contractor Agreement)" defaultValue="Signed agreement" className={`${inputCls} max-w-56`} />
                  <input type="file" name="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="text-xs" required />
                  <button className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900">Upload</button>
                </form>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Snap({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center ring-1 ring-slate-200">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-base font-bold text-slate-800">{value}</div>
    </div>
  );
}
