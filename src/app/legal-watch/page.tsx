import { getCurrentUser, isManager } from "@/lib/auth";
import { readLegalWatchRecords, type LegalWatchRecord } from "@/lib/legal-watch";
import { logManualThreat, optOutNow } from "./actions";

export const dynamic = "force-dynamic";

// ⚖️ Litigator Protocol — the permanent legal-defense file. Every lead that threatened legal action
// or fished for our company info is captured here with its full record (when/how we got them, their
// consent status, WHETHER + WHEN we opted them out, and every message in & out) so nothing is ever
// lost if a complaint is filed. Threats made on a call are logged manually below.
export default async function LegalWatchPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Managers only</h1></div>;
  }
  const records = await readLegalWatchRecords();

  const total = records.length;
  const optedOut = records.filter((r) => r.optedOut).length;
  const notOptedOut = total - optedOut;
  const threats = records.filter((r) => r.threatKind === "litigation-threat" || r.threatKind === "manual").length;
  const nowMonth = new Date().toISOString().slice(0, 7);
  const thisMonth = records.filter((r) => (r.firstFlaggedAt || "").slice(0, 7) === nowMonth).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-16">
      <div>
        <h1 className="text-2xl font-black text-slate-800">⚖️ Litigator Protocol</h1>
        <p className="mt-1 text-sm text-slate-500">
          Permanent legal-defense file. Every lead that threatened legal action or fished for our company info is
          preserved here with its complete record — when &amp; how we got them, their consent status, whether &amp; when
          we opted them out, and every message sent and received. An explicit threat (sue / lawsuit / cease-and-desist /
          TCPA / attorney) auto-opts them out and no automation ever contacts them again. This can never be lost or trimmed.
        </p>
      </div>

      {/* 📊 Monitoring summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="On file" value={total} tone="slate" />
        <Stat label="⚖️ Threats" value={threats} tone="amber" hint="explicit legal threats + manual logs" />
        <Stat label="🚫 Opted out" value={optedOut} tone="emerald" />
        <Stat label="⚠️ Not opted out" value={notOptedOut} tone={notOptedOut > 0 ? "red" : "slate"} hint="review these" />
      </div>
      {thisMonth > 0 && <p className="text-[12px] text-slate-500">📅 {thisMonth} flagged this month.</p>}

      {/* ➕ Log a threat made on a call / in person */}
      <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="cursor-pointer list-none px-4 py-3 text-[14px] font-bold text-slate-800">➕ Log a threat manually <span className="font-normal text-slate-400">— someone said they&apos;d sue us on a call or in person</span></summary>
        <form action={logManualThreat} className="space-y-2 border-t border-slate-100 px-4 py-3 text-[13px]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block"><span className="text-[11px] font-bold text-slate-500">Name *</span><input name="name" required className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" placeholder="Who threatened us" /></label>
            <label className="block"><span className="text-[11px] font-bold text-slate-500">Phone</span><input name="phone" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" placeholder="(optional)" /></label>
            <label className="block"><span className="text-[11px] font-bold text-slate-500">Email</span><input name="email" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" placeholder="(optional)" /></label>
          </div>
          <label className="block"><span className="text-[11px] font-bold text-slate-500">CRM contact ID <span className="font-normal">(optional — if they&apos;re in the CRM, paste their contact id to attach their full history &amp; opt-out)</span></span><input name="contactId" className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" placeholder="(optional)" /></label>
          <label className="block"><span className="text-[11px] font-bold text-slate-500">What they said / the threat *</span><textarea name="note" required rows={3} className="mt-0.5 w-full rounded border border-slate-300 px-2 py-1" placeholder="e.g. On a call 11/13, caller said he'll file a TCPA lawsuit and reported us to the attorney general..." /></label>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-700"><input type="checkbox" name="optOut" defaultChecked className="h-4 w-4" /> Opt them out now (stop all automated contact)</label>
          <button type="submit" className="rounded-lg bg-amber-600 px-3 py-1.5 text-[13px] font-bold text-white hover:bg-amber-700">Log threat</button>
        </form>
      </details>

      {records.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-700">
          ✅ No litigator-flagged leads on file. They&apos;ll appear here automatically the moment someone threatens
          legal action or asks for our company/legal info — or log one above.
        </div>
      )}

      {records.map((r) => (
        <details key={r.contactId} className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm">
          <summary className="cursor-pointer list-none border-b border-amber-100 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-black text-slate-800">⚠️ {r.name || "Unknown"}</span>
              <span className="text-[12px] font-semibold text-slate-500">{r.phone}{r.email ? ` · ${r.email}` : ""}</span>
              <ThreatBadge kind={r.threatKind} />
              <OptBadge r={r} />
              <span className="ml-auto text-[11px] font-semibold text-amber-700">flagged {new Date(r.firstFlaggedAt).toLocaleDateString()}</span>
            </div>
            <div className="mt-1.5 rounded-lg bg-white px-3 py-2 text-[12px] italic text-red-700 ring-1 ring-red-100">“{r.trigger}”</div>
          </summary>
          <div className="space-y-3 px-4 py-3 text-[12px]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact label="📥 Entered the system">{new Date(r.importedAt).toLocaleString()}{r.source ? ` · source: ${r.source}` : ""}</Fact>
              <Fact label="✍️ Consent">{r.consent}</Fact>
              <Fact label="🚫 Opt-out status">{r.optOutStatus}{r.optedOutAt ? ` · ${new Date(r.optedOutAt).toLocaleString()}` : ""}</Fact>
              <Fact label="🗂 Pipeline / stage">{r.pipeline || "—"}{r.stage ? ` · ${r.stage}` : ""}</Fact>
              <Fact label="👤 Owner">{r.assignedTo || "—"}</Fact>
              {r.addedBy && <Fact label="🖊 Logged by">{r.addedBy}</Fact>}
            </div>
            {!r.optedOut && (
              <form action={optOutNow}>
                <input type="hidden" name="contactId" value={r.contactId} />
                <button type="submit" className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-red-700">🚫 Opt them out now</button>
                <span className="ml-2 text-[11px] text-slate-400">stops all automated contact immediately</span>
              </form>
            )}
            <div>
              <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">📜 Full message history ({r.comms.length})</div>
              <ol className="space-y-1.5">
                {r.comms.map((c, i) => (
                  <li key={i} className={`rounded-lg px-2.5 py-1.5 ${c.dir === "out" ? "bg-sky-50 ring-1 ring-sky-100" : c.dir === "in" ? "bg-slate-100" : "bg-amber-50/60 ring-1 ring-amber-100"}`}>
                    <div className="mb-0.5 text-[10px] font-bold text-slate-400">
                      {c.dir === "out" ? "➡️ Us" : c.dir === "in" ? "⬅️ Them" : "⚙️ System"} · {c.kind} · {new Date(c.at).toLocaleString()}{c.by ? ` · ${c.by}` : ""}
                    </div>
                    <div className="whitespace-pre-line text-slate-700">{c.body}</div>
                  </li>
                ))}
                {r.comms.length === 0 && <li className="text-slate-400">No message history captured.</li>}
              </ol>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone: "slate" | "amber" | "emerald" | "red"; hint?: string }) {
  const cls = { slate: "bg-slate-50 ring-slate-200 text-slate-700", amber: "bg-amber-50 ring-amber-200 text-amber-800", emerald: "bg-emerald-50 ring-emerald-200 text-emerald-800", red: "bg-red-50 ring-red-200 text-red-700" }[tone];
  return (
    <div className={`rounded-xl px-3 py-2 ring-1 ${cls}`} title={hint}>
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function ThreatBadge({ kind }: { kind: LegalWatchRecord["threatKind"] }) {
  if (kind === "litigation-threat") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">⚖️ litigation threat</span>;
  if (kind === "manual") return <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">🖊 logged manually</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">🔍 info-fishing</span>;
}

function OptBadge({ r }: { r: LegalWatchRecord }) {
  return r.optedOut
    ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">🚫 opted out</span>
    : <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">⚠️ not opted out</span>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[12px] font-semibold text-slate-700">{children}</div>
    </div>
  );
}
