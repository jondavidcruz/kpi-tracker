"use client";
// 👤 Lead-owner dropdown (Jon 2026-10-08: the chip row was confusing — one
// clear dropdown that always states whose leads you're looking at).
import { useRouter } from "next/navigation";

export default function CrmOwnerSelect({ current, meName, reps, hrefTemplate }: {
  current: string;            // "all" | "role:acquisitions" | "role:dispositions" | rep name
  meName: string;
  reps: string[];
  hrefTemplate: string;       // URL with __WHO__ placeholder
}) {
  const router = useRouter();
  const go = (v: string) => router.push(hrefTemplate.replace("__WHO__", encodeURIComponent(v)));
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
      👤 Viewing leads owned by
      <select
        value={current}
        onChange={(e) => go(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800"
      >
        <option value={meName}>Mine — {meName.split(" ")[0]}</option>
        <option value="all">👥 Everyone</option>
        <option value="role:acquisitions">🧲 Acquisitions team</option>
        <option value="role:dispositions">🤝 Dispo team</option>
        <optgroup label="One person">
          {reps.filter((r) => r !== meName).map((r) => <option key={r} value={r}>{r}</option>)}
        </optgroup>
      </select>
    </label>
  );
}
