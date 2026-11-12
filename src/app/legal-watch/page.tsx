import { getCurrentUser, isManager } from "@/lib/auth";
import { readLegalWatchRecords } from "@/lib/legal-watch";

export const dynamic = "force-dynamic";

// ⚖️ Litigator Protocol — the permanent legal-defense file. Every lead that threatened legal action
// or fished for our company info is captured here with its full record (when/how we got them, their
// consent status, and every message in & out) so nothing is ever lost if a complaint is filed.
export default async function LegalWatchPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Managers only</h1></div>;
  }
  const records = await readLegalWatchRecords();

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-16">
      <div>
        <h1 className="text-2xl font-black text-slate-800">⚖️ Litigator Protocol</h1>
        <p className="mt-1 text-sm text-slate-500">
          Permanent legal-defense file. Every lead that threatened legal action or fished for our company info is
          preserved here with its complete record — when & how we got them, their consent status, and every message
          sent and received. This can never be lost or trimmed. {records.length} on file.
        </p>
      </div>

      {records.length === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center text-sm text-emerald-700">
          ✅ No litigator-flagged leads on file. They&apos;ll appear here automatically the moment someone threatens
          legal action or asks for our company/legal info.
        </div>
      )}

      {records.map((r) => (
        <details key={r.contactId} className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-sm">
          <summary className="cursor-pointer list-none border-b border-amber-100 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-black text-slate-800">⚠️ {r.name || "Unknown"}</span>
              <span className="text-[12px] font-semibold text-slate-500">{r.phone}{r.email ? ` · ${r.email}` : ""}</span>
              <span className="ml-auto text-[11px] font-semibold text-amber-700">flagged {new Date(r.firstFlaggedAt).toLocaleDateString()}</span>
            </div>
            <div className="mt-1.5 rounded-lg bg-white px-3 py-2 text-[12px] italic text-red-700 ring-1 ring-red-100">“{r.trigger}”</div>
          </summary>
          <div className="space-y-3 px-4 py-3 text-[12px]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact label="📥 Imported">{new Date(r.importedAt).toLocaleString()}{r.source ? ` · source: ${r.source}` : ""}</Fact>
              <Fact label="✍️ Consent">{r.consent}</Fact>
              <Fact label="🗂 Pipeline / stage">{r.pipeline || "—"}{r.stage ? ` · ${r.stage}` : ""}</Fact>
              <Fact label="👤 Owner">{r.assignedTo || "—"}</Fact>
            </div>
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

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <div className="text-[10px] font-extrabold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[12px] font-semibold text-slate-700">{children}</div>
    </div>
  );
}
