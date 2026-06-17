"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* user can select */ }
      }}
      className="rounded-md bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
    >
      {done ? "✓ Copied" : label}
    </button>
  );
}
