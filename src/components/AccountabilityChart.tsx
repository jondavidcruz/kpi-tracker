import { saveSeat, deleteSeat } from "@/app/actions";
import { Card } from "@/components/ui";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

export type SeatT = {
  id: string; title: string; holder: string; roles: string; parentId: string | null;
  sortOrder: number; gwcGet: string; gwcWant: string; gwcCapacity: string; gwcNote: string;
  piProfile: string; piTagline: string; piSummary: string; iq: string; ei: string; assessedOn: string; roleFit: string;
};

function fitTone(roleFit: string): string {
  const s = roleFit.toLowerCase();
  if (s.startsWith("strong fit") || s.startsWith("good fit")) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (s.startsWith("partial")) return "border-amber-300 bg-amber-50 text-amber-800";
  if (s.startsWith("misaligned")) return "border-red-300 bg-red-50 text-red-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function Gwc({ label, v }: { label: string; v: string }) {
  const cls = v === "yes" ? "bg-emerald-100 text-emerald-700" : v === "no" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-400";
  const mark = v === "yes" ? "✓" : v === "no" ? "✗" : "?";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`} title={`${label}: ${v || "unknown"}`}>{label} {mark}</span>;
}

function SeatForm({ seat, allSeats }: { seat?: SeatT; allSeats: SeatT[] }) {
  const tri = (name: string, cur: string) => (
    <label><span className={labelCls}>{name}</span>
      <select name={name === "Gets it" ? "gwcGet" : name === "Wants it" ? "gwcWant" : "gwcCapacity"} defaultValue={cur} className={inputCls}>
        <option value="">?</option><option value="yes">Yes</option><option value="no">No</option>
      </select>
    </label>
  );
  return (
    <form action={saveSeat} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {seat && <input type="hidden" name="id" value={seat.id} />}
      <label><span className={labelCls}>Seat / function</span><input name="title" defaultValue={seat?.title ?? ""} placeholder="Acquisitions" className={inputCls} required /></label>
      <label><span className={labelCls}>Who sits here</span><input name="holder" defaultValue={seat?.holder ?? ""} placeholder="Ethan" className={inputCls} /></label>
      <label><span className={labelCls}>Reports to</span>
        <select name="parentId" defaultValue={seat?.parentId ?? ""} className={inputCls}>
          <option value="">— top of chart</option>
          {allSeats.filter((s) => s.id !== seat?.id).map((s) => <option key={s.id} value={s.id}>{s.title}{s.holder ? ` (${s.holder})` : ""}</option>)}
        </select>
      </label>
      <label className="sm:col-span-3"><span className={labelCls}>The 5 key roles (one per line)</span><textarea name="roles" defaultValue={seat?.roles ?? ""} rows={3} className={inputCls} /></label>
      {tri("Gets it", seat?.gwcGet ?? "")}
      {tri("Wants it", seat?.gwcWant ?? "")}
      {tri("Capacity", seat?.gwcCapacity ?? "")}
      <label className="sm:col-span-2"><span className={labelCls}>Notes / values fit</span><input name="gwcNote" defaultValue={seat?.gwcNote ?? ""} className={inputCls} /></label>
      <label><span className={labelCls}>Sort order</span><input name="sortOrder" type="number" defaultValue={seat?.sortOrder ?? 0} className={inputCls} /></label>

      <div className="sm:col-span-3 border-t border-slate-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Assessments</div>
      <label><span className={labelCls}>PI profile</span><input name="piProfile" defaultValue={seat?.piProfile ?? ""} placeholder="Strategist" className={inputCls} /></label>
      <label><span className={labelCls}>IQ</span><input name="iq" defaultValue={seat?.iq ?? ""} className={inputCls} /></label>
      <label><span className={labelCls}>Assessed on</span><input name="assessedOn" defaultValue={seat?.assessedOn ?? ""} placeholder="Jan 2024" className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>PI tagline</span><input name="piTagline" defaultValue={seat?.piTagline ?? ""} className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>PI key traits</span><input name="piSummary" defaultValue={seat?.piSummary ?? ""} className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>EI scores</span><input name="ei" defaultValue={seat?.ei ?? ""} placeholder="SA 8 · SM 7 · Soc 9 · RM 6" className={inputCls} /></label>
      <label className="sm:col-span-3"><span className={labelCls}>Role fit (start with Strong fit / Good fit / Partial / Misaligned for color)</span><textarea name="roleFit" defaultValue={seat?.roleFit ?? ""} rows={2} className={inputCls} /></label>

      <div className="sm:col-span-3"><button className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700">{seat ? "Save seat" : "Add seat"}</button></div>
    </form>
  );
}

function SeatNode({ seat, children, allSeats, depth }: { seat: SeatT; children: SeatT[]; allSeats: SeatT[]; depth: number }) {
  const roles = seat.roles.split("\n").map((r) => r.trim()).filter(Boolean);
  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 18 }} className={depth === 0 ? "" : "border-l-2 border-slate-200 pl-3"}>
      <Card className="mb-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-slate-800">{seat.title}</span>
          {seat.holder && <span className="rounded-md bg-brand-navy px-1.5 py-0.5 text-[11px] font-semibold text-white">{seat.holder}</span>}
          <span className="ml-auto flex flex-wrap justify-end gap-1">
            <Gwc label="Gets it" v={seat.gwcGet} /><Gwc label="Wants it" v={seat.gwcWant} /><Gwc label="Capacity" v={seat.gwcCapacity} />
          </span>
        </div>
        {roles.length > 0 && <ul className="mt-1.5 space-y-0.5">{roles.map((r, i) => <li key={i} className="text-xs text-slate-600">• {r}</li>)}</ul>}
        {seat.gwcNote && <p className="mt-1 text-xs italic text-slate-500">{seat.gwcNote}</p>}

        {/* Assessments (Predictive Index / IQ / EI) */}
        {(seat.piProfile || seat.iq || seat.ei || seat.roleFit) && (
          <div className="mt-2 border-t border-slate-100 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {seat.piProfile && <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700" title={seat.piTagline}>PI: {seat.piProfile}</span>}
              {seat.iq && <span className="rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">IQ {seat.iq}</span>}
              {seat.ei && <span className="rounded-md bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">EI {seat.ei}</span>}
              {seat.assessedOn && <span className="text-[10px] text-slate-400">{seat.assessedOn}</span>}
            </div>
            {seat.piSummary && <p className="mt-1 text-[11px] text-slate-500">{seat.piSummary}</p>}
            {seat.roleFit && <p className={`mt-1.5 rounded-md border px-2 py-1 text-[11px] ${fitTone(seat.roleFit)}`}><strong>Role fit:</strong> {seat.roleFit}</p>}
          </div>
        )}
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-400 hover:text-violet-600">Edit / delete</summary>
          <div className="mt-2"><SeatForm seat={seat} allSeats={allSeats} /></div>
          <form action={deleteSeat} className="mt-1"><input type="hidden" name="id" value={seat.id} /><button className="text-[11px] font-medium text-slate-300 hover:text-red-600">Delete seat</button></form>
        </details>
      </Card>
      {children.map((c) => (
        <SeatNode key={c.id} seat={c} allSeats={allSeats} depth={depth + 1}
          children={allSeats.filter((s) => s.parentId === c.id).sort((a, b) => a.sortOrder - b.sortOrder)} />
      ))}
    </div>
  );
}

export default function AccountabilityChart({ seats }: { seats: SeatT[] }) {
  const roots = seats.filter((s) => !s.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div id="chart" className="scroll-mt-4 space-y-3">
      {seats.length === 0
        ? <Card className="p-6 text-center text-sm text-slate-400">No seats yet. Add the Visionary / Integrator and your major functions below.</Card>
        : <div>{roots.map((r) => (
            <SeatNode key={r.id} seat={r} allSeats={seats} depth={0}
              children={seats.filter((s) => s.parentId === r.id).sort((a, b) => a.sortOrder - b.sortOrder)} />
          ))}</div>}
      <Card className="p-4">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add a seat</h4>
        <SeatForm allSeats={seats} />
      </Card>
    </div>
  );
}
