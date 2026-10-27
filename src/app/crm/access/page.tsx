import Link from "next/link";
import { getCurrentUser, canAccessCSuite, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";
import { readCommsMap, firstOf } from "@/lib/crm-comms";
import { readPipelines, readPipelineLocks, locksToArray } from "@/lib/crm";
import { saveCommsPermsAction, saveCrmPipelineLockAction } from "../actions";
import AutoSaveForm from "@/components/AutoSaveForm";

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
        <p className="text-xs text-slate-500">Unticked = the paid buttons are hidden and blocked server-side for that agent. 👑 leadership (and anyone with a manager role) starts with everything ON until you save a row for them; 🔑 you always keep full access. <b className="text-slate-600">Changes save themselves</b> — no Save button.</p>
        <div className="mt-3 space-y-1.5">
          {users.map((r) => {
            const first = firstOf(r.name);
            const mgr = isManager(r) || r.role === "admin";
            const crown = ["enrico", "viktoriia"].includes(first);
            const owner = first === "jon" || first === "jonathan";
            const p = owner || (!commsMap[first] && mgr) ? { call: true, sms: true, email: true } : commsMap[first] ?? { call: false, sms: false, email: false };
            return (
              <AutoSaveForm key={r.id} action={saveCommsPermsAction} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100">
                <input type="hidden" name="first" value={first} />
                <span className="w-28 font-bold text-slate-700">{r.name.split(" ")[0]}{owner ? " 🔑" : crown ? " 👑" : ""}</span>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="call" defaultChecked={p.call} disabled={owner} /> 📞 call</label>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="sms" defaultChecked={p.sms} disabled={owner} /> 💬 SMS</label>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="email" defaultChecked={p.email} disabled={owner} /> ✉️ email</label>
                {owner && <span className="ml-auto text-[10px] font-bold text-slate-400">owner — always on</span>}
              </AutoSaveForm>
            );
          })}
        </div>
      </Card>

      {/* 🔒 Pipeline lock — confine a rep to one OR MORE pipelines (Jon 2026-10-16). */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-extrabold text-slate-800">🔒 Pipeline lock</div>
        <p className="mb-3 text-xs text-slate-500">Tick the pipeline(s) a rep is allowed to see — they&apos;ll get a tab for <b>each ticked pipeline and every lead in it</b>, and <b>none</b> of our other leads or pipelines (enforced server-side, on the board and on every lead). Tick <b>nothing</b> to leave them on normal own-leads access (no lock). Managers are never locked.</p>
        <div className="space-y-2">
          {users.filter((r) => firstOf(r.name) !== "jon" && firstOf(r.name) !== "jonathan" && r.role !== "manager").map((r) => {
            const first = firstOf(r.name);
            const locked = locksToArray(lockMap[first]);
            return (
              <AutoSaveForm key={r.id} action={saveCrmPipelineLockAction} className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                <input type="hidden" name="first" value={first} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-28 text-xs font-bold text-slate-700">{r.name.split(" ")[0]}</span>
                  {locked.length === 0
                    ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">all pipelines (no lock)</span>
                    : <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">🔒 locked to {locked.length} pipeline{locked.length > 1 ? "s" : ""}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 pl-28">
                  {pipelines.map((p) => (
                    <label key={p.name} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
                      <input type="checkbox" name="pipeline" value={p.name} defaultChecked={locked.includes(p.name)} className="h-3.5 w-3.5 accent-brand-navy" /> {p.name}
                    </label>
                  ))}
                </div>
              </AutoSaveForm>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">💡 e.g. tick <b>Revive Dead</b> + a <b>Cold</b> pipeline to limit a rep to just those two.</p>
      </Card>
    </div>
  );
}
