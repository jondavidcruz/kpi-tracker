"use client";
// Copy-to-clipboard ad text per channel — the passive-marketing paste kit.
import { useState } from "react";

export default function AdCopyBox({ ads }: { ads: Array<{ channel: string; emoji: string; text: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
      {ads.map((a) => (
        <div key={a.channel} className="rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700">{a.emoji} {a.channel}</span>
            <button
              onClick={() => { navigator.clipboard.writeText(a.text).then(() => { setCopied(a.channel); setTimeout(() => setCopied(null), 1500); }).catch(() => {}); }}
              className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${copied === a.channel ? "bg-emerald-600 text-white" : "bg-slate-900 text-white hover:bg-slate-700"}`}
            >
              {copied === a.channel ? "✓ copied" : "📋 copy"}
            </button>
          </div>
          <textarea readOnly value={a.text} rows={7} className="w-full resize-none rounded-lg border border-slate-100 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-600" />
        </div>
      ))}
    </div>
  );
}
