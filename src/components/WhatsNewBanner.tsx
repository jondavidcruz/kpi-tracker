"use client";
// ✨ New-feature announcement bar for the dashboard (Jon 2026-10-22: "make it more
// noticeable — an emoji alone reads like part of the system, not a new feature").
// A bold, clearly-labeled callout that says NEW FEATURE in words, with its own look
// so it can't be mistaken for a normal dashboard tile. Dismissible per viewer; comes
// back only when something NEWER ships (keyed on the latest ship date).
import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "fo_whatsnew_seen";

export default function WhatsNewBanner({ count, latest, href = "/whats-new" }: { count: number; latest: string; href?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!count || !latest) return;
    let seen = "";
    try { seen = localStorage.getItem(KEY) ?? ""; } catch { /* private window */ }
    if (seen < latest) setShow(true);
  }, [count, latest]);

  const dismiss = () => {
    try { localStorage.setItem(KEY, latest); } catch { /* ignore */ }
    setShow(false);
  };

  if (!show) return null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 p-[2px] shadow-lg">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-white/95 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:hidden"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
          </span>
          New feature{count > 1 ? "s" : ""}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-slate-900">
            {count === 1 ? "A new tool just shipped" : `${count} new tools just shipped`} — here&apos;s how to use {count === 1 ? "it" : "them"}.
          </div>
          <div className="text-[11px] text-slate-500">Takes 1 minute. Updated for your role.</div>
        </div>
        <Link href={href} onClick={dismiss} className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white shadow hover:bg-slate-800">
          See what&apos;s new →
        </Link>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
      </div>
    </div>
  );
}
