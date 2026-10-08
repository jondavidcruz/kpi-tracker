import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps } from "@/lib/data";
import { Card, SectionTitle } from "@/components/ui";
import { readCommsMap, firstOf } from "@/lib/crm-comms";
import { saveCommsPermsAction } from "../actions";

export const dynamic = "force-dynamic";

// 📡 Comms access — who gets the PAID channels, in its own room.
export default async function CrmAccessPage() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return <Card className="p-10 text-center text-slate-400">Comms access is manager-only.</Card>;
  const [reps, commsMap] = await Promise.all([getActiveReps(), readCommsMap()]);

  return (
    <div className="space-y-4">
      <SectionTitle title="📡 Comms Access" subtitle="Who can call / text / email (the paid channels). Everyone always keeps the free features — notes, tasks, stages, appointments." accent="bg-brand-gold"
        right={<Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link>} />

      <Card className="p-4">
        <p className="text-xs text-slate-500">Unticked = the paid buttons are hidden and blocked server-side for that agent. Managers always have everything.</p>
        <div className="mt-3 space-y-1.5">
          {reps.map((r) => {
            const first = firstOf(r.name);
            const p = commsMap[first] ?? { call: false, sms: false, email: false };
            return (
              <form key={r.id} action={saveCommsPermsAction} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs ring-1 ring-slate-100">
                <input type="hidden" name="first" value={first} />
                <span className="w-28 font-bold text-slate-700">{r.name.split(" ")[0]}</span>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="call" defaultChecked={p.call} /> 📞 call</label>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="sms" defaultChecked={p.sms} /> 💬 SMS</label>
                <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="email" defaultChecked={p.email} /> ✉️ email</label>
                <button className="ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700">Save</button>
              </form>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
