"use client";
// 🔔 Due-today reminder (Jon 2026-10-13): the person in charge of a lead gets a
// pop-up the moment they open the CRM if they have a task or appointment due
// today — so a due appointment is never missed. Dismissible; stays dismissed
// for the rest of the day (per-day localStorage key), re-appears tomorrow.
import { useEffect, useState } from "react";

type Item = { title: string; oppId: string; when: string; kind: "appt" | "task" };

export default function DueTodayReminder({ tasks, appts }: { tasks: { title: string; oppId: string; due: string }[]; appts: { title: string; oppId: string; at: string }[] }) {
  const [open, setOpen] = useState(false);
  const items: Item[] = [
    ...appts.map((a) => ({ title: a.title, oppId: a.oppId, when: new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), kind: "appt" as const })),
    ...tasks.map((t) => ({ title: t.title, oppId: t.oppId, when: "today", kind: "task" as const })),
  ];
  const key = `fo_due_dismissed_${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    if (!items.length) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem(key) === "1"; } catch { /* ok */ }
    if (!dismissed) setOpen(true);
  }, [items.length, key]);

  if (!open || !items.length) return null;
  const close = () => { setOpen(false); try { localStorage.setItem(key, "1"); } catch { /* ok */ } };
  const apptN = items.filter((i) => i.kind === "appt").length;
  const taskN = items.filter((i) => i.kind === "task").length;

  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-extrabold text-slate-900">
            🔔 Due today — don&apos;t miss it
            <div className="mt-0.5 text-[11px] font-semibold text-slate-500">
              {apptN > 0 && <span className="text-red-600">{apptN} appointment{apptN > 1 ? "s" : ""}</span>}
              {apptN > 0 && taskN > 0 && " · "}
              {taskN > 0 && <span className="text-emerald-600">{taskN} task{taskN > 1 ? "s" : ""}</span>}
            </div>
          </div>
          <button onClick={close} className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-200">Got it ✕</button>
        </div>
        <div className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto">
          {items.map((i, k) => (
            <a key={k} href={i.oppId ? `/crm/${i.oppId}` : "/crm/tasks"} className={`flex items-center gap-2 rounded-xl px-3 py-2 ring-1 ${i.kind === "appt" ? "bg-red-50 ring-red-100 hover:bg-red-100" : "bg-emerald-50 ring-emerald-100 hover:bg-emerald-100"}`}>
              <span className="text-base">{i.kind === "appt" ? "📅" : "✅"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-slate-800">{i.title}</span>
                <span className="text-[10px] font-semibold text-slate-500">{i.kind === "appt" ? `Appointment · ${i.when}` : "Task due today"}</span>
              </span>
              <span className="shrink-0 text-[10px] font-bold text-slate-400">Open →</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
