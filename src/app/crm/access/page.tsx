import Link from "next/link";
import { getCurrentUser, canAccessCSuite, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { readCommsMap, firstOf } from "@/lib/crm-comms";
import { readPipelines, readPipelineLocks } from "@/lib/crm";
import { saveCommsPermsAction, saveCrmPipelineLockAction } from "../actions";

export const dynamic = "force-dynamic";

// 📡 Comms access — who gets the PAID channels, in its own room.
export default async function CrmAccessPage() {
  const me = await getCurrentUser();
  if (!me || !canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 System Settings — C-suite only.</Card>;
  // EVERYONE active except admins (Jon can't lock himself out) — managers like
  // Viktoriia + Enrico included; they default to full access until saved.
  // Show the WHOLE active roster except Jon himself (several teammates carry
  // the admin role, so filtering by role hid them — 2026-10-12). Only the
  // owner is excluded: he can never lock himself out.
  const [allUsers, commsMap, pipelines, lockMap] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    readCommsMap(),
    readPipelines(),
    readPipelineLocks(),
  ]);
  const users = allUsers; // Jon 2026-10-12: show EVERYONE — his own row renders as always-on

  return (
    <div className="space-y-4">
      <SectionTitle title="📡 Comms Access" subtitle="Who can call / text / email (the paid channels). Everyone always keeps the free features — notes, tasks, stages, appointments." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      <Card className="p-4">
        <p className="text-xs text-slate-500">Unticked = the paid buttons are hidden and blocked server-side for that agent. 👑 leadership (and anyone with a manager role) starts with everything ON until you save a row for them; 🔑 you always keep full access.</p>
        <div className="mt-3 space-y-1.5">
          {users.map((r) => {
            const first = firstOf(r.name);
            const mgr = isManager(r) || r.role === "admin";
            const crown = ["enrico", "viktoriia"].includes(first);
            const owner = first === "jon" || first === "jonathan";
            const p = owner || (!commsMap[first] && mgr) ? { call: true, sms: true, email: true } : commsMap[first] ?? { call: false, sms: false, email: false };
            return (
              <form key={r.id} action={saveCommsPermsAction} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100">
                <input type="hidden" name="first" value={first} />
                <span className="w-28 font-bold text-slate-700">{r.name.split(" ")[0]}{owner ? " 🔑" : crown ? " 👑" : ""}</span>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="call" defaultChecked={p.call} disabled={owner} /> 📞 call</label>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="sms" defaultChecked={p.sms} disabled={owner} /> 💬 SMS</label>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="email" defaultChecked={p.email} disabled={owner} /> ✉️ email</label>
                {owner ? <span className="ml-auto text-[10px] font-bold text-slate-400">owner — always on</span> : <button className="ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700">Save</button>}
              </form>
            );
          })}
        </div>
      </Card>

      {/* 🔒 Pipeline lock — confine a rep to ONE pipeline (Jon 2026-10-16: Kyle). */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-extrabold text-slate-800">🔒 Pipeline lock</div>
        <p className="mb-3 text-xs text-slate-500">Confine a rep to a single pipeline — they&apos;ll see <b>only that pipeline and every lead in it</b>, and <b>none</b> of our other leads or pipelines (enforced server-side, on the board and on every lead). Leave a rep on &quot;— all pipelines&quot; for normal own-leads access. Managers are never locked.</p>
        <div className="space-y-1.5">
          {users.filter((r) => firstOf(r.name) !== "jon" && firstOf(r.name) !== "jonathan" && r.role !== "manager").map((r) => {
            const first = firstOf(r.name);
            return (
              <form key={r.id} action={saveCrmPipelineLockAction} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100">
                <input type="hidden" name="first" value={first} />
                <span className="w-28 font-bold text-slate-700">{r.name.split(" ")[0]}</span>
                <select name="pipeline" defaultValue={lockMap[first] ?? ""} className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700">
                  <option value="">— all pipelines (no lock)</option>
                  {pipelines.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
                <button className="ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700">Save</button>
                {lockMap[first] && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">locked → {lockMap[first]}</span>}
              </form>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
