"use client";
// 🔀 CRM view switcher (Jon 2026-11-05: the Board/List/Week/Conversations/Velocity tabs were
// invisible in the top-right and unused). A single dropdown next to the pipeline selector so
// people can actually find how to change the board format.
import { useRouter } from "next/navigation";

export default function CrmViewSelect({ view, whoQ, manager }: { view: string; whoQ: string; manager: boolean }) {
  const router = useRouter();
  const current = ["kanban", "list", "cal"].includes(view) ? view : "kanban";
  const go = (v: string) => {
    if (v === "conversations") router.push("/crm/conversations");
    else if (v === "velocity") router.push("/crm/velocity");
    else router.push(`/crm?view=${v}${whoQ}`);
  };
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-slate-400">View</span>
      <select
        value={current}
        onChange={(e) => go(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
      >
        <option value="kanban">🗂 Board</option>
        <option value="list">📋 List</option>
        <option value="cal">📅 Week</option>
        <option value="conversations">💬 Conversations</option>
        {manager && <option value="velocity">📊 Velocity</option>}
      </select>
    </label>
  );
}
