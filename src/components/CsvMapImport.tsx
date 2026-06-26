"use client";

import { useMemo, useState } from "react";
import { importMarketContactsMapped } from "@/app/actions";

// Import fields — the first 9 mirror the Buyer Research table columns EXACTLY
// (Links · Name · Number · Number · Email · Notes · Buying area · Buy box · Status),
// then a few extra optional fields. `key` matches the import action + the DB field.
const FIELDS: { key: string; label: string; aliases: string[] }[] = [
  { key: "name", label: "Name *", aliases: ["name", "builder", "contact", "full name", "owner", "company", "business", "dba"] },
  { key: "links", label: "Links (website / LinkedIn / IG)", aliases: ["links", "link", "website", "web", "url", "site", "linkedin", "social", "instagram", "ig", "facebook"] },
  { key: "phone", label: "Number (phone)", aliases: ["phone", "number", "phone1", "phone 1", "cell", "mobile", "primary phone", "number 1", "tel"] },
  { key: "phone2", label: "Number (2nd phone)", aliases: ["phone2", "number2", "number 2", "second number", "alt phone", "office", "secondary phone", "phone 2"] },
  { key: "email", label: "Email", aliases: ["email", "e-mail", "mail"] },
  { key: "outreachLog", label: "Notes", aliases: ["notes", "note", "comments", "log", "remarks"] },
  { key: "buyBoxAreas", label: "Buying area", aliases: ["buying area", "buyingarea", "areas", "target areas", "buyboxareas", "neighborhoods", "preferred markets", "target geography", "market", "city", "location"] },
  { key: "buyBox", label: "Buy box", aliases: ["buybox", "buy box", "buy-box", "criteria"] },
  { key: "status", label: "Status", aliases: ["status", "stage", "rating"] },
  // ── extra optional fields ──
  { key: "company", label: "Company / Firm", aliases: ["company", "firm", "dev firm", "business", "llc"] },
  { key: "type", label: "Type (developer/flipper)", aliases: ["type", "tier", "buyer type"] },
  { key: "category", label: "Category (luxury/distressed)", aliases: ["category"] },
  { key: "priceRange", label: "Price range", aliases: ["pricerange", "price range", "budget"] },
  { key: "dealType", label: "Deal type", aliases: ["dealtype", "deal type"] },
  { key: "buildType", label: "Build type", aliases: ["buildtype", "build type"] },
  { key: "region", label: "Region / State", aliases: ["region", "state"] },
  { key: "vetArea", label: "Deal / area (tab)", aliases: ["vetarea", "deal", "tab", "sourcing area"] },
];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

function autoGuess(headers: string[]): Record<string, number> {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const m: Record<string, number> = {};
  for (const f of FIELDS) {
    let hit = -1;
    for (const a of f.aliases) { const i = norm.indexOf(a); if (i >= 0) { hit = i; break; } }
    if (hit < 0) hit = norm.findIndex((h) => f.aliases.some((a) => h.includes(a)));
    m[f.key] = hit;
  }
  return m;
}

export default function CsvMapImport() {
  const [text, setText] = useState("");
  const [map, setMap] = useState<Record<string, number>>({});
  const [fileName, setFileName] = useState("");

  const parsed = useMemo(() => parseCsv(text), [text]);
  const headers = parsed[0] ?? [];
  const dataRows = parsed.slice(1);

  const ingest = (raw: string, name?: string) => {
    setText(raw);
    const rows = parseCsv(raw);
    if (rows[0]) setMap(autoGuess(rows[0]));
    if (name) setFileName(name);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => ingest(String(reader.result ?? ""), file.name);
    reader.readAsText(file);
  };

  const setCol = (key: string, col: number) => setMap((p) => ({ ...p, [key]: col }));
  const cell = (rowIdx: number, key: string) => { const i = map[key]; return i != null && i >= 0 ? (dataRows[rowIdx]?.[i] ?? "") : ""; };
  const nameMapped = (map.name ?? -1) >= 0;
  const importable = dataRows.filter((r) => { const i = map.name; return i != null && i >= 0 && String(r[i] ?? "").trim() !== ""; }).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          📂 Choose CSV file
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" />
        </label>
        {fileName && <span className="text-xs text-slate-500">{fileName}</span>}
        <span className="text-xs text-slate-400">…or paste rows below</span>
      </div>
      <textarea
        value={text}
        onChange={(e) => ingest(e.target.value)}
        placeholder="Paste CSV here (first row = headers)…"
        rows={3}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-200"
      />

      {headers.length > 0 && (
        <>
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Map your columns — pick which CSV column feeds each field. We auto-guessed; fix any that are off.
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex items-center gap-2 text-xs">
                  <span className={`w-40 shrink-0 font-semibold ${f.key === "name" ? "text-red-600" : "text-slate-600"}`}>{f.label}</span>
                  <select
                    value={map[f.key] ?? -1}
                    onChange={(e) => setCol(f.key, Number(e.target.value))}
                    className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs ${f.key === "name" && !nameMapped ? "border-red-300 bg-red-50" : "border-slate-300"}`}
                  >
                    <option value={-1}>— skip —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          {dataRows.length > 0 && (
            <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-slate-400">
                  <tr><th className="px-2 py-1.5">Links</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Number</th><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Notes</th><th className="px-2 py-1.5">Buying area</th><th className="px-2 py-1.5">Buy box</th></tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 3).map((_, r) => (
                    <tr key={r} className="border-t border-slate-100">
                      <td className="max-w-[120px] truncate px-2 py-1.5 text-sky-600">{cell(r, "links")}</td>
                      <td className="px-2 py-1.5 font-semibold text-slate-700">{cell(r, "name") || <span className="text-slate-300">—</span>}</td>
                      <td className="px-2 py-1.5 text-slate-500">{cell(r, "phone")}</td>
                      <td className="px-2 py-1.5 text-slate-500">{cell(r, "email")}</td>
                      <td className="max-w-[120px] truncate px-2 py-1.5 text-slate-500">{cell(r, "outreachLog")}</td>
                      <td className="px-2 py-1.5 text-slate-500">{cell(r, "buyBoxAreas")}</td>
                      <td className="max-w-[120px] truncate px-2 py-1.5 text-slate-500">{cell(r, "buyBox")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-slate-50 px-2 py-1 text-[10px] text-slate-400">Preview of the first 3 rows — {importable} of {dataRows.length} rows have a name and will import.</div>
            </div>
          )}

          <form action={importMarketContactsMapped} className="flex items-center gap-3">
            <input type="hidden" name="csv" value={text} />
            <input type="hidden" name="map" value={JSON.stringify(map)} />
            <button
              type="submit"
              disabled={!nameMapped || importable === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              ✓ Import {importable || ""} buyer{importable === 1 ? "" : "s"}
            </button>
            {!nameMapped && <span className="text-xs font-semibold text-red-600">Map the Name column first.</span>}
          </form>
        </>
      )}
    </div>
  );
}
