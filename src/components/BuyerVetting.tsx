import { Card } from "@/components/ui";
import { setBuyerStage, logBuyerOutreach } from "@/app/actions";

// A prospect row mirrors one line of the dispo team's outreach spreadsheet.
export type Prospect = {
  id: string; name: string; website: string; email: string; phone: string;
  buyBoxAreas: string; outreachLog: string; lastContacted: string; nextFollowUp: string;
  vetStage: string; igHandle: string;
};

function ProspectRow({ p, canEdit }: { p: Prospect; canEdit: boolean }) {
  const site = p.website ? p.website.split(/\s+/)[0] : "";
  const log = (p.outreachLog || "").split("\n").filter(Boolean);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-slate-800">{p.name}</span>
        {p.lastContacted && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">last: {p.lastContacted}</span>}
        {p.nextFollowUp && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">next: {p.nextFollowUp}</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        {site && <a href={site} target="_blank" rel="noopener noreferrer" className="text-brand-navy hover:underline">🔗 site</a>}
        {p.email && <a href={`mailto:${p.email}`} className="text-brand-navy hover:underline">✉️ {p.email}</a>}
        {p.phone && <span className="text-slate-600">📞 {p.phone}</span>}
        {p.igHandle && <span className="text-violet-700">📸 {p.igHandle}</span>}
      </div>
      {p.buyBoxAreas && <p className="mt-1 text-xs text-emerald-700">🎯 Buys: {p.buyBoxAreas}</p>}
      {log.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-500">📋 Outreach log ({log.length})</summary>
          <ul className="mt-1 space-y-0.5">{log.map((l, i) => <li key={i} className="text-[11px] text-slate-600">• {l}</li>)}</ul>
        </details>
      )}
      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <form action={logBuyerOutreach} className="flex items-center gap-1">
            <input type="hidden" name="id" value={p.id} />
            <input name="note" placeholder="log a touch… (call, email, IG)" className="w-44 rounded border border-slate-300 px-2 py-1 text-xs" />
            <button className="rounded bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700" title="Counts toward Buyers Contacted">📇 Log</button>
          </form>
          <form action={setBuyerStage} className="contents">
            <input type="hidden" name="id" value={p.id} />
            <button name="stage" value="vetted" className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700" title="Graduate into Markets &amp; Buyers — counts toward New Buyers Added">✓ Vetted</button>
            <button name="stage" value="dead" className="rounded bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-300">✕ Not interested</button>
          </form>
        </div>
      )}
    </div>
  );
}

export default function BuyerVetting({ areas, dead, canEdit, stats }: {
  areas: { area: string; prospects: Prospect[] }[];
  dead: Prospect[];
  canEdit: boolean;
  stats: { pipeline: number; contacted7: number; vetted: number };
}) {
  return (
    <div id="vetting" className="space-y-4">
      {/* KPI tie-in — the dispo outbound effort that feeds Buyers Contacted + New Buyers Added */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums text-slate-800">{stats.pipeline}</div>
          <div className="text-[11px] font-semibold text-slate-500">In pipeline (to vet)</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums text-sky-700">{stats.contacted7}</div>
          <div className="text-[11px] font-semibold text-slate-500">Contacted (7d) → 📇 Buyers Contacted</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums text-emerald-700">{stats.vetted}</div>
          <div className="text-[11px] font-semibold text-slate-500">Vetted buyers → ➕ New Buyers Added</div>
        </Card>
      </div>
      <p className="text-xs text-slate-500">We look for developers in each area where we have an opportunity or deal. Work each list top-to-bottom — log every touch (it feeds your <strong>Buyers Contacted</strong> KPI), and when one qualifies, hit <strong>✓ Vetted</strong> to move them into Markets &amp; Buyers (<strong>New Buyers Added</strong>).</p>

      {areas.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">No prospects in vetting yet.</Card>}
      {areas.map(({ area, prospects }) => (
        <details key={area} open className="rounded-xl border border-slate-200 bg-slate-50/50">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-slate-700">
            🏗 {area} <span className="font-normal text-slate-400">· {prospects.length} prospect{prospects.length === 1 ? "" : "s"}</span>
          </summary>
          <div className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-2">
            {prospects.map((p) => <ProspectRow key={p.id} p={p} canEdit={canEdit} />)}
          </div>
        </details>
      ))}

      {dead.length > 0 && (
        <details className="rounded-xl border border-slate-200">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-slate-500">🗄 Not interested / archived · {dead.length}</summary>
          <div className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-2">
            {dead.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                <div>
                  <div className="text-sm font-semibold text-slate-600">{p.name}</div>
                  {p.outreachLog && <div className="text-[11px] text-slate-400">{p.outreachLog.split("\n")[0]}</div>}
                </div>
                {canEdit && (
                  <form action={setBuyerStage}>
                    <input type="hidden" name="id" value={p.id} />
                    <button name="stage" value="to_vet" className="rounded bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-300">↩ Re-open</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
