"use client";
// GHL-style pipeline dropdown (replaces the chip row).
import { useRouter } from "next/navigation";

export default function PipelineSelect({ pipelines, current, baseQs }: { pipelines: Array<{ name: string; count: number }>; current: string; baseQs: string }) {
  const router = useRouter();
  return (
    <select
      value={current}
      onChange={(e) => router.push(`/crm?${baseQs}&pl=${encodeURIComponent(e.target.value)}`)}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm"
      title="Switch pipeline"
    >
      {pipelines.map((p) => (
        <option key={p.name} value={p.name}>{p.name} — {p.count.toLocaleString()} leads</option>
      ))}
    </select>
  );
}
