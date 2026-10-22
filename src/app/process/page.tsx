import { SectionTitle } from "@/components/ui";
import ProcessMap from "@/components/ProcessMap";
import { getCurrentUser, isManager, isCSuitePerson, canAccessMarketing } from "@/lib/auth";
import { secondaryPositionOf } from "@/lib/roles";

export const dynamic = "force-dynamic";

// Reps only see THEIR lane of the pipeline (Jon 2026-08-26: an acquisitions rep
// like Nick or Austin gets the Acquisitions steps, not the whole map). Managers
// + the trusted three see everything. Hybrids get both of their lanes; the
// Markets & Buyers flag adds the Marketing (lead-gen) lane.
const ROLE_DEPTS: Record<string, string[]> = {
  acquisitions: ["Acquisitions", "Underwriting"],
  cc_lm: ["Marketing", "Acquisitions"],
  dispositions: ["Dispositions", "Escrow", "Closing", "Listings"],
};

export default async function ProcessPage() {
  const me = await getCurrentUser();
  const fullView = !me || isManager(me) || isCSuitePerson(me);
  let allowedDepts: string[] | null = null;
  let acqOnly = false;
  if (!fullView && me) {
    const base = ROLE_DEPTS[me.position ?? ""] ?? ROLE_DEPTS.acquisitions;
    const sec = secondaryPositionOf(me);
    const extra = sec ? ROLE_DEPTS[sec] ?? [] : [];
    const mkt = canAccessMarketing(me) ? ["Marketing"] : [];
    allowedDepts = [...new Set([...base, ...extra, ...mkt])];
    // A PURE acquisitions rep (no dispo secondary, no marketing) sees only their
    // sales process — not the dispo land play or the whole deal-type menu (Jon 2026-10-16).
    acqOnly = me.position === "acquisitions" && !sec && !canAccessMarketing(me);
  }

  const showDispoSop = fullView || (allowedDepts?.includes("Dispositions") ?? false);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗺️ Deal Flow — Process Map"
        subtitle={allowedDepts
          ? "Your lane of the deal flow, step by step. Managers see the whole pipeline."
          : "Pick the right workflow for the deal — standard close, rejected→listing, cash-for-keys, pre-foreclosure, probate, or other issues. Each is a step-by-step checklist."}
        accent="bg-brand-gold"
      />

      {/* 📋 Process Map vs SOP — the difference, in one place, so everyone knows which
          is which (Jon 2026-10-21). The map lives here; the deep SOP opens from here. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="text-sm font-extrabold text-slate-800">🗺️ Process Map <span className="font-semibold text-slate-400">— this page</span></div>
          <p className="mt-1 text-[12px] text-slate-600">The <b>whole deal flow</b> at a glance — every department&apos;s steps in order, so you always know <b>where a deal is and what&apos;s next</b>. The map of the territory.</p>
        </div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-slate-800">📋 SOP <span className="font-semibold text-slate-400">— deep dive</span></div>
            {showDispoSop && <a href="/sop/dispo" target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700">Open Dispo SOP →</a>}
          </div>
          <p className="mt-1 text-[12px] text-slate-600">The <b>exact how-to</b> for one lane — step by step with <b>gates</b> that stay HELD until every box is checked (document specs, the utilities call, the 72-hour cascade). The field manual that goes deep where the map goes wide.</p>
        </div>
      </div>

      <ProcessMap allowedDepts={allowedDepts} acqOnly={acqOnly} />
    </div>
  );
}
