"use client";
// Client-side CSV lead importer. Parses the file, lets the manager choose EXACTLY how the list is
// imported (who gets it — one rep or a weighted split, house vs land, whether to make call tasks,
// pipeline, tags), previews, then POSTs to /api/admin/import-leads in chunks. See the route for the
// server side. Options added Jon 2026-11-07 ("I want all the options selectable so the system knows
// how the leads should be uploaded"; default = all to Nick, no call-now task on bulk lists).
import { useEffect, useMemo, useState } from "react";

type Src = { value: string; label: string };
type Row = Record<string, string>;
type Lead = {
  name: string; phone: string; phone2: string; email: string; mailing: string;
  propAddr: string; market: string; county: string; state: string; apn: string; notes: string; rank: number; owner?: string;
};
type Rep = { name: string; weight: number };
type ImpLog = { seq: number; label: string; count: number; at: string; by: string; scrubbed?: boolean; scrubVia?: string; dncSuppressed?: number };

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

export default function LeadImporter({ sources, repNames = [], pipelines = [], pipelineStages = {} }: { sources: Src[]; repNames?: string[]; pipelines?: string[]; pipelineStages?: Record<string, { key: string; label: string }[]> }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("PPL");

  // ── How the list is imported (all selectable) ──
  const [assignMode, setAssignMode] = useState<"one" | "split">("one");
  const defaultRep = repNames.find((r) => /nicholas|nick/i.test(r)) || repNames[0] || "Nicholas Fair";
  const [singleRep, setSingleRep] = useState(defaultRep);
  const [splitReps, setSplitReps] = useState<Rep[]>([{ name: defaultRep, weight: 5 }, { name: repNames.find((r) => /kyle/i.test(r)) || "Kyle Brown", weight: 1 }]);
  const [forcePipeline, setForcePipeline] = useState("");  // "" = auto (by rep)
  const [stage, setStage] = useState("");                  // "" = first stage (New)
  const [leadKind, setLeadKind] = useState<"home" | "land">("home");
  const forcedStages = forcePipeline ? (pipelineStages[forcePipeline] || []) : [];
  const stageLabel = stage ? (forcedStages.find((s) => s.key === stage)?.label || stage) : "New (first stage)";
  const [makeTask, setMakeTask] = useState(false);          // Jon: 500 "call now" tasks is too many
  const [taskTopN, setTaskTopN] = useState(0);              // 0 = all (only used when makeTask)
  const [priority, setPriority] = useState(true);

  const [listLabel, setListLabel] = useState("");
  const [extraTags, setExtraTags] = useState("");
  const [seq, setSeq] = useState<number | null>(null);
  const [history, setHistory] = useState<ImpLog[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{ created: number; dupes: number; skipped: number; dncSuppressed: number } | null>(null);
  // 🚫 DNC scrub attestation (Jon 2026-11-13) — every list must be verified DNC-scrubbed before import.
  const [scrubbed, setScrubbed] = useState(false);
  const [scrubVia, setScrubVia] = useState("DealMachine");
  const [internalDnc, setInternalDnc] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/admin/import-leads").then((r) => r.json()).then((j) => {
      if (j.ok) {
        setSeq(j.nextSeq); setHistory(j.history ?? []);
        if (typeof j.internalDnc === "number") setInternalDnc(j.internalDnc);
        const d = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
        setListLabel(`List #${j.nextSeq} — ${d}`);
      }
    }).catch(() => {});
  }, []);

  // ⬇️ Export just the phone numbers as a CSV ready to upload to cleanleads365.com/cleaner.
  function exportForCleaner() {
    const seen = new Set<string>();
    const rows = ["phone,name"];
    for (const l of leads) {
      const p = (l.phone || "").trim(); if (!p) continue;
      const key = p.replace(/\D/g, "").slice(-10); if (key.length === 10 && seen.has(key)) continue; if (key.length === 10) seen.add(key);
      rows.push(`${p.replace(/"/g, "")},${(l.name || "").replace(/[",\n]/g, " ")}`);
      const p2 = (l.phone2 || "").trim(); if (p2) { const k2 = p2.replace(/\D/g, "").slice(-10); if (!(k2.length === 10 && seen.has(k2))) { if (k2.length === 10) seen.add(k2); rows.push(`${p2.replace(/"/g, "")},${(l.name || "").replace(/[",\n]/g, " ")}`); } }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${(listLabel || "list").replace(/[^\w-]+/g, "_")}_phones_for_cleanleads.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  }

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
          state: pick(obj, "Property State", "State"),
          apn: pick(obj, "Parcel ID", "APN"), notes, rank: rankOf(notes),
        };
      }).filter((l) => l.name || l.phone);
      mapped.sort((a, b) => a.rank - b.rank);
      setLeads(mapped);
    };
    reader.readAsText(file);
  }

  // Assign leads to owners based on the chosen mode.
  const assigned = useMemo(() => {
    if (assignMode === "one") return leads.map((l) => ({ ...l, owner: singleRep }));
    const valid = splitReps.filter((r) => r.name.trim() && r.weight > 0);
    const counts: Record<string, number> = {}; valid.forEach((r) => (counts[r.name] = 0));
    return leads.map((l) => {
      if (!valid.length) return { ...l, owner: "" };
      let best = valid[0]; let bestRatio = Infinity;
      for (const r of valid) { const ratio = (counts[r.name] + 1) / r.weight; if (ratio < bestRatio) { bestRatio = ratio; best = r; } }
      counts[best.name]++; return { ...l, owner: best.name };
    });
  }, [leads, assignMode, singleRep, splitReps]);

  const perRep = useMemo(() => {
    const m: Record<string, number> = {}; for (const l of assigned) if (l.owner) m[l.owner] = (m[l.owner] || 0) + 1; return m;
  }, [assigned]);

  const statesSummary = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) { const s = (l.state || "").trim().toUpperCase(); if (s) m[s] = (m[s] || 0) + 1; }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${s} (${c})`).join(" · ");
  }, [leads]);

  async function runImport() {
    if (!assigned.length || busy) return;
    const summary = [
      `Import ${assigned.length} leads as ${leadKind === "land" ? "🌵 LAND" : "🏠 HOUSE"} leads?`,
      "",
      Object.entries(perRep).map(([n, c]) => `${n}: ${c}`).join("\n"),
      "",
      `Source: ${source}`,
      `Pipeline: ${forcePipeline || "auto (by rep)"}`,
      `Tag: ${listLabel}${priority ? " + 🔥 priority" : ""}${extraTags.trim() ? " + " + extraTags : ""} + 📍 state`,
      makeTask ? `📞 Call-now task: ${taskTopN > 0 ? `top ${taskTopN} by rank` : "every lead"}` : "No call-now tasks (bulk list)",
      "",
      scrubbed ? `✅ DNC-scrubbed via ${scrubVia}.` : "⚠️ NOT marked DNC-scrubbed — this batch will be flagged. Scrub it (cleanleads365 / DealMachine) first to protect us.",
      "Also auto-removes anyone already on OUR DNC / litigator list. Deduped by phone/email. No welcome texts sent.",
    ].join("\n");
    if (!confirm(summary)) return;
    setBusy(true); setResult(null);
    const listTag = `📋 ${listLabel}`;
    const priorityTag = priority ? "🔥 priority" : "";
    const chunkSize = 100;
    const totals = { created: 0, dupes: 0, skipped: 0, dncSuppressed: 0 };
    try {
      for (let i = 0; i < assigned.length; i += chunkSize) {
        const chunk = assigned.slice(i, i + chunkSize);
        setProgress(`Importing ${Math.min(i + chunkSize, assigned.length)} / ${assigned.length}…`);
        const r = await fetch("/api/admin/import-leads", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leads: chunk, source, listTag, priorityTag, extraTags, stage, leadKind, makeTask, taskTopN, pipeline: forcePipeline }),
        });
        const j = await r.json();
        if (!j.ok) { setProgress(`⚠️ Chunk failed: ${j.error || "error"} — stopped at ${totals.created} imported.`); setBusy(false); return; }
        totals.created += j.created; totals.dupes += j.dupes; totals.skipped += j.skipped; totals.dncSuppressed += (j.dncSuppressed || 0);
      }
      await fetch("/api/admin/import-leads?finalize=1", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seq, label: listLabel, count: totals.created, scrubbed, scrubVia, dncSuppressed: totals.dncSuppressed }),
      }).catch(() => {});
      setResult(totals); setProgress("");
    } catch { setProgress("⚠️ Network error during import."); }
    setBusy(false);
  }

  const inputCls = "rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:opacity-90">
          📄 Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
        {fileName && <span className="ml-3 text-sm text-slate-500">{fileName} — <b>{leads.length}</b> leads{statesSummary ? ` · ${statesSummary}` : ""}</span>}
      </div>

      {leads.length > 0 && (
        <div className="space-y-4">
          {/* ── Import options ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">How should these leads be imported?</div>

            {/* Who gets them */}
            <div className="mb-3">
              <div className="mb-1.5 text-sm font-semibold text-slate-700">👤 Assign to</div>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${assignMode === "one" ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200"}`}>
                  <input type="radio" className="hidden" checked={assignMode === "one"} onChange={() => setAssignMode("one")} /> One rep
                </label>
                <label className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ${assignMode === "split" ? "bg-indigo-600 text-white ring-indigo-600" : "bg-white text-slate-600 ring-slate-200"}`}>
                  <input type="radio" className="hidden" checked={assignMode === "split"} onChange={() => setAssignMode("split")} /> Split across reps
                </label>
                {assignMode === "one" && (
                  <select value={singleRep} onChange={(e) => setSingleRep(e.target.value)} className={inputCls}>
                    {(repNames.length ? repNames : [singleRep]).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>
              {assignMode === "split" && (
                <div className="mt-2 rounded-xl bg-slate-50 p-3">
                  {splitReps.map((r, i) => (
                    <div key={i} className="mt-1 flex items-center gap-2">
                      {repNames.length ? (
                        <select value={r.name} onChange={(e) => setSplitReps((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className={`flex-1 ${inputCls}`}>
                          <option value="">— rep —</option>
                          {repNames.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      ) : (
                        <input value={r.name} onChange={(e) => setSplitReps((rs) => rs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Rep name" className={`flex-1 ${inputCls}`} />
                      )}
                      <input type="number" min={0} value={r.weight} onChange={(e) => setSplitReps((rs) => rs.map((x, j) => j === i ? { ...x, weight: Math.max(0, Number(e.target.value) || 0) } : x))} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <span className="w-12 text-right text-sm font-bold text-emerald-700">{perRep[r.name] ?? 0}</span>
                      {splitReps.length > 1 && <button onClick={() => setSplitReps((rs) => rs.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500">✕</button>}
                    </div>
                  ))}
                  <button onClick={() => setSplitReps((rs) => [...rs, { name: "", weight: 1 }])} className="mt-2 text-xs font-bold text-slate-500 hover:text-slate-700">+ add rep</button>
                  <div className="mt-1 text-[11px] text-slate-400">Weight = share. 5 &amp; 1 → one rep gets 5× the other, interleaved by rank for a fair spread.</div>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* House vs Land */}
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">Lead type</div>
                <div className="flex gap-2">
                  <label className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-center text-sm font-semibold ring-1 ${leadKind === "home" ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-slate-600 ring-slate-200"}`}>
                    <input type="radio" className="hidden" checked={leadKind === "home"} onChange={() => setLeadKind("home")} /> 🏠 House
                  </label>
                  <label className={`flex-1 cursor-pointer rounded-lg px-3 py-1.5 text-center text-sm font-semibold ring-1 ${leadKind === "land" ? "bg-amber-600 text-white ring-amber-600" : "bg-white text-slate-600 ring-slate-200"}`}>
                    <input type="radio" className="hidden" checked={leadKind === "land"} onChange={() => setLeadKind("land")} /> 🌵 Land
                  </label>
                </div>
              </div>
              {/* Pipeline */}
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">Pipeline</div>
                <select value={forcePipeline} onChange={(e) => { setForcePipeline(e.target.value); setStage(""); }} className={`w-full ${inputCls}`}>
                  <option value="">Auto — the rep&apos;s pipeline</option>
                  {pipelines.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {/* Stage */}
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">Stage</div>
                {forcePipeline && forcedStages.length ? (
                  <select value={stage} onChange={(e) => setStage(e.target.value)} className={`w-full ${inputCls}`}>
                    <option value="">New (first stage)</option>
                    {forcedStages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                ) : (
                  <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-400 ring-1 ring-slate-200">Lands in <b>New</b> — pick a pipeline to choose a stage</div>
                )}
              </div>
              {/* Lead source */}
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">Lead source</div>
                <select value={source} onChange={(e) => setSource(e.target.value)} className={`w-full ${inputCls}`}>
                  {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Tasks */}
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={makeTask} onChange={(e) => setMakeTask(e.target.checked)} /> 📞 Create a “call now” task per lead
              </label>
              {makeTask ? (
                <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-600">
                  Only for the top
                  <input type="number" min={0} value={taskTopN} onChange={(e) => setTaskTopN(Math.max(0, Number(e.target.value) || 0))} className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                  by rank <span className="text-[11px] text-slate-400">(0 = every lead — careful with big lists)</span>
                </div>
              ) : <div className="mt-1 text-[11px] text-slate-400">Off by default — a 500-lead list would create 500 tasks. Leads still land in the “new” stage to work.</div>}
            </div>

            {/* Tags */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">List tag {seq != null && <span className="text-xs font-normal text-slate-300">(seq #{seq})</span>}</div>
                <input value={listLabel} onChange={(e) => setListLabel(e.target.value)} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <div className="mb-1 text-sm font-semibold text-slate-700">Extra tags <span className="text-xs font-normal text-slate-300">(comma-separated)</span></div>
                <input value={extraTags} onChange={(e) => setExtraTags(e.target.value)} placeholder="e.g. Vacant, Inherited" className={`w-full ${inputCls}`} />
              </div>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} /> Tag as 🔥 priority (all-new list)</label>
            <div className="mt-1 text-[11px] text-slate-400">Every lead is also auto-tagged with its state — 📍 {statesSummary || "TX / FL …"}.</div>
          </div>

          {/* ── Mapping verification — exactly what each lead becomes (uses your top lead as the example) ── */}
          {assigned[0] && (() => {
            const ex = assigned[0];
            const exTags = [`📋 ${listLabel}`, priority ? "🔥 priority" : "", ...extraTags.split(",").map((t) => t.trim()).filter(Boolean), (ex.state || "").toUpperCase() ? `📍 ${(ex.state || "").toUpperCase()}` : ""].filter(Boolean);
            const field = (lbl: string, val: string, ok = true) => (
              <div className="flex items-baseline gap-2 py-0.5">
                <span className="w-28 shrink-0 text-[11px] font-semibold text-slate-400">{lbl}</span>
                <span className={`min-w-0 flex-1 text-[13px] ${val ? "font-semibold text-slate-700" : "italic text-slate-300"}`}>{val || (ok ? "—" : "⚠️ missing")}</span>
              </div>
            );
            return (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-indigo-200">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-500">✅ What each lead becomes <span className="font-normal normal-case text-slate-400">— verify this is right (example: your #{ex.rank} lead)</span></div>
                <div className="grid gap-3 md:grid-cols-2">
                  {/* Opportunity card */}
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">🗂 Opportunity card (the deal)</div>
                    <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
                      <div className="text-[14px] font-bold text-slate-800">⭐ {ex.name || "(no name)"}</div>
                      <div className="truncate text-[13px] font-semibold text-brand-navy">📍 {ex.propAddr || "⚠️ no property address"}</div>
                      <div className="text-[13px] font-bold text-emerald-600">📞 {ex.phone || "⚠️ no phone"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{leadKind === "land" ? "🌵 Land" : "🏠 House"}</span>
                        {exTags.map((t, i) => <span key={i} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">{t}</span>)}
                      </div>
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-500">→ <b>{ex.owner || "unassigned"}</b> · {forcePipeline || `${(ex.owner || "").split(" ")[0]}'s pipeline`} · <b>{stageLabel}</b> · source <b>{source}</b></div>
                  </div>
                  {/* Contact card */}
                  <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">👤 Contact card (the person)</div>
                    <div className="rounded-lg bg-white p-2.5 ring-1 ring-slate-200">
                      {field("Name", ex.name, false)}
                      {field("Phone", ex.phone, false)}
                      {field("Email", ex.email)}
                      {field("Property addr", ex.propAddr, false)}
                      {field("Mailing addr", ex.mailing)}
                    </div>
                    <div className="mt-1.5 text-[11px] text-slate-400">Property address shows on the card&apos;s 📍 line; mailing is kept for mailers.</div>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">Columns read: <b>Seller Full Name</b> → name · <b>Seller Phone</b> → phone · <b>Seller Email</b> → email · <b>Property Address/City/State/Zip</b> → property line · <b>Property State</b> → 📍 tag · <b>rank: N</b> in notes → priority order. If a field says ⚠️ missing, the CSV column is empty for that lead.</div>
              </div>
            );
          })()}

          {/* ── Preview ── */}
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Preview — top by rank</div>
              <div className="text-xs font-semibold text-slate-500">{Object.entries(perRep).map(([n, c]) => `${n.split(" ")[0]}: ${c}`).join(" · ")}</div>
            </div>
            <div className="mt-2 max-h-48 overflow-auto text-[12px]">
              <table className="w-full">
                <tbody>
                  {assigned.slice(0, 12).map((l, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1 pr-2 text-slate-400">#{l.rank}</td>
                      <td className="py-1 pr-2 font-semibold text-slate-700">{l.name}</td>
                      <td className="py-1 pr-2 text-slate-500">{l.propAddr}</td>
                      <td className="py-1 pr-2 text-slate-500">{l.phone}</td>
                      <td className="py-1 pr-2 text-[11px] font-bold text-slate-400">📍 {(l.state || "?").toUpperCase()}</td>
                      <td className="py-1 font-bold text-emerald-700">{l.owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 🚫 DNC verification — protect us before anything imports ── */}
          <div className={`rounded-2xl p-4 shadow-sm ring-1 ${scrubbed ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-300"}`}>
            <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">🚫 DNC check — protect us before import</div>
            <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={scrubbed} onChange={(e) => setScrubbed(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>This list was scrubbed for DNC before upload
                <select value={scrubVia} onChange={(e) => setScrubVia(e.target.value)} className="ml-2 rounded border border-slate-300 px-1.5 py-0.5 text-[13px]" onClick={(e) => e.preventDefault()}>
                  <option>DealMachine</option>
                  <option>cleanleads365</option>
                  <option>Both</option>
                  <option>Other</option>
                </select>
              </span>
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              <button type="button" onClick={exportForCleaner} className="rounded-lg bg-slate-800 px-3 py-1.5 font-bold text-white hover:bg-slate-700">⬇️ Export phones for cleanleads365</button>
              <a href="https://cleanleads365.com/cleaner" target="_blank" rel="noopener noreferrer" className="font-semibold text-indigo-600 hover:underline">Open cleanleads365 cleaner →</a>
              <span className="text-slate-400">scrub there (1 credit/number), then re-upload the cleaned file.</span>
            </div>
            <div className="mt-2 text-[12px] text-slate-600">
              {!scrubbed && <span className="font-semibold text-amber-700">⚠️ Not marked scrubbed — the batch will be flagged. </span>}
              We also auto-remove anyone already on <b>OUR</b> DNC / litigator list{internalDnc != null ? ` (${internalDnc.toLocaleString()} numbers)` : ""} — they can never be re-imported.
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
          ✓ Imported <b>{result.created}</b> new leads. {result.dncSuppressed > 0 && <><b className="text-red-700">🚫 Removed {result.dncSuppressed}</b> already on our DNC/litigator list. </>}{result.dupes > 0 && <>Skipped <b>{result.dupes}</b> already in the CRM. </>}{result.skipped > 0 && <>Couldn&apos;t place {result.skipped}. </>}They&apos;re on the board now, tagged &ldquo;{listLabel}&rdquo;{scrubbed ? ` · ✅ DNC-scrubbed (${scrubVia})` : " · ⚠️ not marked DNC-scrubbed"}.
        </div>
      )}

      {history.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Past uploads</div>
          <div className="mt-2 space-y-1 text-[12px]">
            {history.map((h) => (
              <div key={h.seq} className="flex justify-between text-slate-600">
                <span><b>#{h.seq}</b> · {h.label} {h.scrubbed ? <span className="text-emerald-600" title={`DNC-scrubbed via ${h.scrubVia || "?"}`}>✅ scrubbed</span> : <span className="text-amber-600">⚠️ not scrubbed</span>}{(h.dncSuppressed ?? 0) > 0 ? <span className="text-red-600"> · 🚫 {h.dncSuppressed} removed</span> : null}</span>
                <span className="text-slate-400">{h.count} leads · {new Date(h.at).toLocaleDateString()} · {h.by}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
