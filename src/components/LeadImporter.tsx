"use client";
// Client-side CSV lead importer. Parses the file, maps columns, splits leads across reps by a
// weighted ratio (round-robin on rank so each rep gets a fair spread), previews, then POSTs to
// /api/admin/import-leads in chunks. See the route for the server side.
import { useEffect, useMemo, useState } from "react";

type Src = { value: string; label: string };
type Row = Record<string, string>;
type Lead = {
  name: string; phone: string; phone2: string; email: string; mailing: string;
  propAddr: string; market: string; county: string; apn: string; notes: string; rank: number; owner?: string;
};
type Rep = { name: string; weight: number };
type ImpLog = { seq: number; label: string; count: number; at: string; by: string };

// minimal RFC-4180 CSV parser (quoted fields, embedded commas/quotes/newlines)
function parseCsv(t: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else { if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c === "\r") { /* skip */ } else f += c; }
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}

function pick(r: Row, ...keys: string[]): string { for (const k of keys) { const v = r[k.toLowerCase()]; if (v && v.trim()) return v.trim(); } return ""; }
function rankOf(notes: string): number { const m = notes.match(/rank:\s*(\d+)/i); return m ? parseInt(m[1], 10) : 9999; }

export default function LeadImporter({ sources }: { sources: Src[] }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("PPL");
  const [reps, setReps] = useState<Rep[]>([{ name: "Nicholas Fair", weight: 5 }, { name: "Kyle Brown", weight: 1 }]);
  const [listLabel, setListLabel] = useState("");
  const [seq, setSeq] = useState<number | null>(null);
  const [priority, setPriority] = useState(true);
  const [history, setHistory] = useState<ImpLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ created: number; dupes: number; skipped: number } | null>(null);

  useEffect(() => {
    fetch("/api/admin/import-leads").then((r) => r.json()).then((j) => {
      if (j.ok) {
        setSeq(j.nextSeq); setHistory(j.history ?? []);
        const d = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        setListLabel(`List #${j.nextSeq} — ${d}`);
      }
    }).catch(() => {});
  }, []);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setFileName(file.name); setResult(null); setProgress("");
    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result || ""));
      if (rows.length < 2) { setLeads([]); return; }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const mapped: Lead[] = rows.slice(1).filter((r) => r.length > 1).map((r) => {
        const obj: Row = {}; header.forEach((h, i) => { obj[h] = r[i] ?? ""; });
        const notes = pick(obj, "Seller Notes", "Notes");
        const addr = [pick(obj, "Property Address"), pick(obj, "Property City"), `${pick(obj, "Property State")} ${pick(obj, "Property Zip")}`.trim()].filter(Boolean).join(", ");
        const mailing = [pick(obj, "Mailing Street"), pick(obj, "Mailing City"), `${pick(obj, "Mailing State")} ${pick(obj, "Mailing Zip")}`.trim()].filter(Boolean).join(", ");
        return {
          name: pick(obj, "Seller Full Name", "Full Name", "Name") || [pick(obj, "Seller First Name"), pick(obj, "Seller Last Name")].filter(Boolean).join(" "),
          phone: pick(obj, "Seller Phone", "Phone", "Phone 1"), phone2: pick(obj, "Seller Phone 2", "Phone 2"),
          email: pick(obj, "Seller Email", "Email", "Email 1"),
          mailing, propAddr: addr, market: pick(obj, "Market / Metro", "Market"), county: pick(obj, "County"),
          apn: pick(obj, "Parcel ID", "APN"), notes, rank: rankOf(notes),
        };
      }).filter((l) => l.name || l.phone);
      mapped.sort((a, b) => a.rank - b.rank);
      setLeads(mapped);
    };
    reader.readAsText(file);
  }

  // weighted round-robin on rank: assign each lead to the rep with the smallest (assigned+1)/weight.
  const assigned = useMemo(() => {
    const valid = reps.filter((r) => r.name.trim() && r.weight > 0);
    const counts: Record<string, number> = {}; valid.forEach((r) => (counts[r.name] = 0));
    return leads.map((l) => {
      if (!valid.length) return { ...l, owner: "" };
      let best = valid[0]; let bestRatio = Infinity;
      for (const r of valid) { const ratio = (counts[r.name] + 1) / r.weight; if (ratio < bestRatio) { bestRatio = ratio; best = r; } }
      counts[best.name]++; return { ...l, owner: best.name };
    });
  }, [leads, reps]);

  const perRep = useMemo(() => {
    const m: Record<string, number> = {}; for (const l of assigned) if (l.owner) m[l.owner] = (m[l.owner] || 0) + 1; return m;
  }, [assigned]);

  async function runImport() {
    if (!assigned.length || busy) return;
    if (!confirm(`Import ${assigned.length} leads?\n\n${Object.entries(perRep).map(([n, c]) => `${n}: ${c}`).join("\n")}\n\nSource: ${source}\nTag: ${listLabel}${priority ? " + 🔥 priority" : ""}\n\nDeduped by phone/email. No welcome texts sent.`)) return;
    setBusy(true); setResult(null);
    const listTag = `📋 ${listLabel}`;
    const priorityTag = priority ? "🔥 priority" : "";
    const chunkSize = 100;
    const totals = { created: 0, dupes: 0, skipped: 0 };
    try {
      for (let i = 0; i < assigned.length; i += chunkSize) {
        const chunk = assigned.slice(i, i + chunkSize);
        setProgress(`Importing ${Math.min(i + chunkSize, assigned.length)} / ${assigned.length}…`);
        const r = await fetch("/api/admin/import-leads", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: chunk, source, listTag, priorityTag, stage: "" }),
        });
        const j = await r.json();
        if (!j.ok) { setProgress(`⚠️ Chunk failed: ${j.error || "error"} — stopped at ${totals.created} imported.`); setBusy(false); return; }
        totals.created += j.created; totals.dupes += j.dupes; totals.skipped += j.skipped;
      }
      // record the upload in the sequence log
      await fetch("/api/admin/import-leads?finalize=1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seq, label: listLabel, count: totals.created }),
      }).catch(() => {});
      setResult(totals); setProgress("");
    } catch { setProgress("⚠️ Network error during import."); }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          📄 Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
        {fileName && <span className="ml-3 text-sm text-slate-500">{fileName} — <b>{leads.length}</b> leads</span>}
      </div>

      {leads.length > 0 && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Split across reps (by weight)</div>
              {reps.map((r, i) => (
                <div key={i} className="mt-2 flex items-center gap-2">
                  <input value={r.name} onChange={(e) => setReps((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Rep name" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
                  <input type="number" min={0} value={r.weight} onChange={(e) => setReps((rs) => rs.map((x, j) => j === i ? { ...x, weight: Math.max(0, Number(e.target.value) || 0) } : x))} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  <span className="w-12 text-right text-sm font-bold text-emerald-700">{perRep[r.name] ?? 0}</span>
                  {reps.length > 2 && <button onClick={() => setReps((rs) => rs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">✕</button>}
                </div>
              ))}
              <button onClick={() => setReps((rs) => [...rs, { name: "", weight: 1 }])} className="mt-2 text-xs font-bold text-slate-500 hover:text-slate-700">+ add rep</button>
              <div className="mt-2 text-[11px] text-slate-400">Weight = share of leads. 5 &amp; 1 → one rep gets 5× the other. Interleaved by rank so each gets a fair spread of hot/cold.</div>
            </div>

            <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-2.5">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Lead source</div>
                <select value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm">
                  {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-slate-400">List tag {seq != null && <span className="text-slate-300">(seq #{seq})</span>}</div>
                <input value={listLabel} onChange={(e) => setListLabel(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} /> Tag as 🔥 priority (all-new list)</label>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Preview — top by rank</div>
            <div className="mt-2 max-h-48 overflow-auto text-[12px]">
              <table className="w-full">
                <tbody>
                  {assigned.slice(0, 12).map((l, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 pr-2 text-slate-400">#{l.rank}</td>
                      <td className="py-1 pr-2 font-semibold text-slate-700">{l.name}</td>
                      <td className="py-1 pr-2 text-slate-500">{l.propAddr}</td>
                      <td className="py-1 pr-2 text-slate-500">{l.phone}</td>
                      <td className="py-1 font-bold text-emerald-700">{l.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={runImport} disabled={busy} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? "Importing…" : `Import ${assigned.length} leads`}</button>
            {progress && <span className="text-sm font-semibold text-slate-600">{progress}</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          ✓ Imported <b>{result.created}</b> new leads. {result.dupes > 0 && <>Skipped <b>{result.dupes}</b> already in the CRM. </>}{result.skipped > 0 && <>Couldn&apos;t place {result.skipped}. </>}They&apos;re on the board now, tagged &ldquo;{listLabel}&rdquo;.
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Past uploads</div>
          <div className="mt-2 space-y-1 text-[12px]">
            {history.map((h) => (
              <div key={h.seq} className="flex justify-between text-slate-600">
                <span><b>#{h.seq}</b> · {h.label}</span>
                <span className="text-slate-400">{h.count} leads · {new Date(h.at).toLocaleDateString()} · {h.by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
