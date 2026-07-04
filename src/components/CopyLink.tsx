"use client";

import { useState } from "react";

/** Copy a same-origin path (e.g. /assess/abc) as a full URL to the clipboard. */
export default function CopyLink({ path, label = "Copy link" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      const url = `${window.location.origin}${path}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* ignore */ }
  };
  return (
    <button onClick={copy} className="rounded-lg bg-brand-navy px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-navy-700">
      {copied ? "✓ Copied" : `🔗 ${label}`}
    </button>
  );
}
