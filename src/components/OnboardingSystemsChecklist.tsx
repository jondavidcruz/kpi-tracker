"use client";
// 🧰 New-hire systems setup checklist by role (Jon 2026-10-15: "make it easier so
// if I ask someone else to do the onboarding, they can simply do this job").
// Pick the role + type the new hire's name → a tracked checklist of every account
// they need, with notes. Progress saves per hire in the browser so a delegate can
// work down the list and come back. No sensitive data — safe to hand off.
import { useEffect, useMemo, useState } from "react";

type Sys = { name: string; note: string; tag: "required" | "expires" | "free" | "free-self" | "training" | "task" };
const SYSTEMS: Record<string, { label: string; emoji: string; systems: Sys[] }> = {
  acquisitions: {
    label: "Acquisitions", emoji: "🎯",
    systems: [
      { name: "War Room Account", note: "Their login to this app — create it in Admin → Team, assign Acquisitions + Rep. It starts in locked onboarding mode.", tag: "required" },
      { name: "Predictive Index / personality assessment", note: "Have them take the Predictive Index (behavioral/personality) test so we put them in their best-fit seat. The link is in their welcome email.", tag: "training" },
      { name: "Regrid Account", note: "Land comps / parcel data.", tag: "required" },
      { name: "REI AI Login", note: "Comps. ⚠️ Shared login EXPIRES Nov 7, 2026 — don't build a long-term process on it. Login is in Software & Logins.", tag: "expires" },
      { name: "Propwire Account", note: "Comps — free; they create their own.", tag: "free-self" },
      { name: "Redfin / Zillow", note: "Comps — free public sites, no account needed.", tag: "free" },
      { name: "Eric Cline Sales Training", note: "members.theericcline.com — complete the sales course. Shared login is in Software & Logins.", tag: "training" },
      { name: "Write your own sales script", note: "After the Eric Cline training, they write their own script (don't hand them a canned one — they internalize it by writing it).", tag: "task" },
    ],
  },
  dispositions: {
    label: "Dispositions", emoji: "📦",
    systems: [
      { name: "War Room Account", note: "Their login to this app — create it in Admin → Team, assign Dispositions + Rep. Starts in locked onboarding mode.", tag: "required" },
      { name: "Predictive Index / personality assessment", note: "Have them take the Predictive Index (behavioral/personality) test so we put them in their best-fit seat. The link is in their welcome email.", tag: "training" },
      { name: "Regrid Account", note: "Land comps / parcel data.", tag: "required" },
      { name: "iSpeedToLead", note: "Lead-speed / disposition tooling.", tag: "required" },
      { name: "LinkedIn / Facebook / Craigslist", note: "Buyer outreach + passive marketing channels — their own accounts.", tag: "free-self" },
    ],
  },
};
const TAG: Record<Sys["tag"], { label: string; cls: string }> = {
  required: { label: "we provide", cls: "bg-brand-navy text-white" },
  expires: { label: "expires Nov 7", cls: "bg-red-100 text-red-700" },
  free: { label: "free · no account", cls: "bg-emerald-100 text-emerald-700" },
  "free-self": { label: "free · they make it", cls: "bg-sky-100 text-sky-700" },
  training: { label: "training", cls: "bg-violet-100 text-violet-700" },
  task: { label: "they do it", cls: "bg-amber-100 text-amber-700" },
};

export default function OnboardingSystemsChecklist() {
  const [role, setRole] = useState<string>("acquisitions");
  const [hire, setHire] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const key = useMemo(() => `fo_onb_${role}_${hire.trim().toLowerCase() || "new"}`, [role, hire]);

  useEffect(() => { try { const v = localStorage.getItem(key); setDone(v ? JSON.parse(v) : {}); } catch { setDone({}); } }, [key]);
  const toggle = (name: string) => setDone((d) => { const nd = { ...d, [name]: !d[name] }; try { localStorage.setItem(key, JSON.stringify(nd)); } catch {} return nd; });
  const reset = () => { setDone({}); try { localStorage.removeItem(key); } catch {} };

  const list = SYSTEMS[role].systems;
  const count = list.filter((s) => done[s.name]).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(SYSTEMS).map(([k, v]) => (
          <button key={k} onClick={() => setRole(k)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${role === k ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{v.emoji} {v.label}</button>
        ))}
        <input value={hire} onChange={(e) => setHire(e.target.value)} placeholder="New hire's name (saves their progress)" className="ml-auto w-60 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
      </div>

      <div className="rounded-xl ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
          <div className="text-xs font-bold text-slate-500">{SYSTEMS[role].emoji} {SYSTEMS[role].label} — systems to set up{hire.trim() ? ` for ${hire.trim()}` : ""}</div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${count === list.length ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{count}/{list.length} done</span>
            {count > 0 && <button onClick={reset} className="text-[11px] font-semibold text-slate-400 hover:text-slate-600">reset</button>}
          </div>
        </div>
        <ul>
          {list.map((s, i) => (
            <li key={s.name} className={`flex items-start gap-3 px-4 py-2.5 ${i ? "border-t border-slate-50" : ""}`}>
              <button onClick={() => toggle(s.name)} className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px] ${done[s.name] ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-emerald-400"}`}>✓</button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm font-bold ${done[s.name] ? "text-slate-400 line-through" : "text-slate-800"}`}>{i + 1}. {s.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${TAG[s.tag].cls}`}>{TAG[s.tag].label}</span>
                </div>
                <div className="text-[12px] leading-snug text-slate-500">{s.note}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-slate-400">Hand this page to whoever runs onboarding — they pick the role, type the hire&apos;s name, and work down the list. Progress is saved on their device. The War Room account (step 1) is created in Admin → Team; it starts locked to newbie basics until you certify them.</p>
    </div>
  );
}
