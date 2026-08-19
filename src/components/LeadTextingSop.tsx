// Visual SOP: List Pull → Skip Trace → SMS (land acquisition pipeline).
// Source: Jon's List_Pull_SkipTrace_SMS_SOP.pdf (v1.0 · Aug 2026), rendered as a
// step-by-step visual pipeline. Rule #1: run phases in order — no texting until
// Phase 3 (scrub) is 100% complete.

const PHASES: {
  n: number; emoji: string; title: string; tool: string; color: string; ring: string; bg: string;
  items: { head: string; detail: string; warn?: boolean }[];
}[] = [
  {
    n: 1, emoji: "📥", title: "Pull the list", tool: "DirectREI (+ Regrid)", color: "text-sky-800", ring: "ring-sky-200", bg: "bg-sky-50",
    items: [
      { head: "Filter stack", detail: "Vacant land + tax delinquent + absentee owner · set the acreage band" },
      { head: "Dedupe FIRST", detail: "Check against all prior pulls + active pipeline — never pay to import the same parcel twice" },
      { head: "Full import ($0.08/rec), never Basic", detail: "Full adds the owner MAILING address — required for the strongest skip-trace format" },
      { head: "Export CSV, never PDF", detail: "PDF exports drop city/ZIP/mailing and force re-parsing" },
      { head: "Regrid spot-check", detail: "Verify road access, landlocked, wetlands/slope on questionable parcels (free tier: 25 lookups/day)" },
    ],
  },
  {
    n: 2, emoji: "🔍", title: "Format & skip trace", tool: "SkipMatrix", color: "text-violet-800", ring: "ring-violet-200", bg: "bg-violet-50",
    items: [
      { head: "Owner Information template", detail: "First/Last + Mailing + Property address · UTF-8 BOM, exact headers — highest match confidence" },
      { head: "Entities separated", detail: "Trusts/LLCs with no person name → trustee mailing lookup, or pull the trustee off the deed (county Register of Deeds)" },
      { head: "Include marginal records", detail: "SkipMatrix bills matches only and refunds no-hits — no reason to trim" },
      { head: "Archive the raw results untouched", detail: "Save the returned file BEFORE any edits" },
    ],
  },
  {
    n: 3, emoji: "🧹", title: "Scrub — in this exact order", tool: "SkipMatrix does NONE of this", color: "text-red-800", ring: "ring-red-200", bg: "bg-red-50",
    items: [
      { head: "Line type", detail: "Mobile vs landline — text MOBILES only; landlines route to the dialer or direct mail" },
      { head: "Active / connected check", detail: "Disconnected numbers bounce — bounces destroy sender reputation" },
      { head: "FCC Reassigned Numbers Database", detail: "The number may belong to a stranger now; the RND check is a TCPA safe-harbor defense", warn: true },
      { head: "Deceased flag", detail: "Dead owners route to probate / heir research — not SMS" },
      { head: "Federal DNC + Tennessee state DNC", detail: "TN runs its OWN registry — scrub both", warn: true },
      { head: "Litigator / serial-plaintiff scrub", detail: "~⅓ of TCPA suits come from repeat plaintiffs hunting violations — $500–$1,500 PER TEXT", warn: true },
      { head: "Internal suppression list", detail: "Every prior opt-out, STOP reply & dead lead — permanent, grows forever, checked every campaign" },
      { head: "Save timestamped scrub receipts", detail: "This is your safe-harbor documentation" },
    ],
  },
  {
    n: 4, emoji: "📤", title: "Send health", tool: "Protect the numbers", color: "text-emerald-800", ring: "ring-emerald-200", bg: "bg-emerald-50",
    items: [
      { head: "Ramp new numbers", detail: "Start tens/day, build over 2–3 weeks — day-one blasts get carrier-filtered" },
      { head: "Rotate numbers", detail: "Spread volume across lines; keep per-number daily volume modest" },
      { head: "Vary templates", detail: "Identical mass texts pattern-match as spam — write 4–5 rotating variants" },
      { head: "First message rules", detail: "No links · plain conversational text · identify yourself · include \"Reply STOP to opt out\"" },
      { head: "Quiet hours", detail: "8am–9pm in the RECIPIENT'S time zone" },
      { head: "Opt-outs honored same day", detail: "Straight to the suppression list, no exceptions" },
      { head: "Watch delivery rate", detail: "Deliveries drop or blocks spike → STOP sending, diagnose before resuming", warn: true },
    ],
  },
  {
    n: 5, emoji: "🗂️", title: "Paper trail", tool: "Your legal shield", color: "text-amber-800", ring: "ring-amber-200", bg: "bg-amber-50",
    items: [
      { head: "Archive per campaign", detail: "Scrub receipts + opt-out log + list source + date pulled" },
      { head: "Keep this SOP dated & versioned", detail: "A documented procedure can reduce or eliminate fines on accidental violations" },
    ],
  },
];

export default function LeadTextingSop() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-slate-900 dark:text-slate-100">📥→💬 List Pull → Skip Trace → SMS — the SOP</strong>
        <span className="text-[11px] text-slate-400">Land pipeline · DirectREI + Regrid + SkipMatrix · v1.0 Aug 2026</span>
      </div>

      {/* The one rule */}
      <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
        ⛔ Run every phase IN ORDER. Do not send a single text until Phase 3 (scrub) is 100% complete.
      </div>

      {/* Phase pipeline */}
      <div className="mt-4 space-y-1">
        {PHASES.map((p, i) => (
          <div key={p.n}>
            <div className={`rounded-xl ${p.bg} p-4 ring-1 ${p.ring} dark:bg-slate-800/60 dark:ring-slate-700`}>
              <div className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg ring-2 ${p.ring} dark:bg-slate-900`}>{p.emoji}</span>
                <div>
                  <div className={`text-sm font-extrabold uppercase tracking-wide ${p.color} dark:text-slate-100`}>Phase {p.n} — {p.title}</div>
                  <div className="text-[11px] font-semibold text-slate-500">{p.tool}</div>
                </div>
              </div>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {p.items.map((it) => (
                  <li key={it.head} className={`rounded-lg bg-white/70 px-3 py-2 text-[13px] ring-1 ${it.warn ? "ring-red-300" : "ring-slate-200"} dark:bg-slate-900/60 dark:ring-slate-700`}>
                    <span className={`font-bold ${it.warn ? "text-red-700 dark:text-red-300" : "text-slate-800 dark:text-slate-100"}`}>{it.warn ? "⚠️ " : "✅ "}{it.head}:</span>{" "}
                    <span className="text-slate-600 dark:text-slate-300">{it.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
            {i < PHASES.length - 1 && <div className="py-0.5 text-center text-lg leading-none text-slate-300">▼</div>}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-slate-400">
        Pairs with the state rules & channel playbooks on <a href="/compliance" className="underline">Compliance</a> — quiet hours, consent, and the A2P/10DLC registration that keeps these texts delivering.
      </p>
    </div>
  );
}
