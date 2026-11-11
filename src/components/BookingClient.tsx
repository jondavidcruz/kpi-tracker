"use client";
import { useState } from "react";

// 📅 Interactive slot picker for the public /book page. Posts the chosen time to /api/book (the
// token carries which lead it is). No login — the link itself is the credential.
type Slot = { iso: string; label: string };
type Day = { heading: string; slots: Slot[] };

export default function BookingClient({ token, days, rep }: { token: string; days: Day[]; rep: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function book(slot: string) {
    if (busy) return;
    setPicked(slot); setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, slot }) });
      const j = await res.json();
      if (j.ok) setDone(j.whenPT || "your selected time");
      else setErr(j.error || "Something went wrong — please try again.");
    } catch {
      setErr("Couldn't reach us — please try again in a moment.");
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <div className="mb-1 text-3xl">✅</div>
        <div className="text-lg font-bold text-emerald-800">You&apos;re booked!</div>
        <p className="mt-1 text-sm text-emerald-700">{rep} will call you on <b>{done}</b> (Pacific). We just sent a calendar invite — see you then!</p>
      </div>
    );
  }

  if (!days.length) {
    return <p className="mt-5 rounded-xl bg-slate-50 p-4 text-center text-sm text-slate-500">No open times right now — reply to our last message and we&apos;ll set one up.</p>;
  }

  return (
    <div className="mt-5 space-y-4">
      {days.map((d) => (
        <div key={d.heading}>
          <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-400">{d.heading}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {d.slots.map((s) => (
              <button
                key={s.iso}
                type="button"
                disabled={busy}
                onClick={() => book(s.iso)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition disabled:opacity-50 ${picked === s.iso ? "border-emerald-400 bg-emerald-500 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"}`}
              >
                {busy && picked === s.iso ? "…" : s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-600">{err}</p>}
    </div>
  );
}
