"use client";
// 🕵️ Member Preview pane (Jon 2026-10-16: "open in the same screen to mirror
// exactly how that user would see what they have access to").
//
// The embedded page is the REAL app rendered AS the teammate (?viewas=<id>), so it
// already includes their REAL sidebar — their menu, hidden money, access redirects.
// A compact "jump to a page" selector drives it while preserving ?viewas (links
// inside the iframe would drop it and render as the owner).
//
// Cache-bust (Jon 2026-10-19: "the preview doesn't show anything even though access
// is granted"): the iframe kept showing a STALE render after access changes. We give
// each preview session a nonce and append it to the src, and a ↻ button bumps it, so
// the iframe always pulls a fresh server render that reflects the latest access.
import { useState } from "react";

type Item = { href: string; label: string };
type Group = { group: string; items: Item[] };

export default function PreviewPane({
  userId, firstName, groups, startHref,
}: { userId: string; firstName: string; groups: Group[]; startHref: string }) {
  const [active, setActive] = useState<string>(startHref);
  const [nonce, setNonce] = useState<number>(() => Date.now());
  const src = `${active}?viewas=${userId}&_fresh=${nonce}`;
  const activeLabel = groups.flatMap((g) => g.items).find((i) => i.href === active)?.label ?? active;

  return (
    <div className="overflow-hidden rounded-xl ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
        <span className="truncate text-[12px] font-semibold text-slate-600">
          Viewing <b>{activeLabel}</b> as {firstName} — this is exactly {firstName}&apos;s screen, their real sidebar and all
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
          Jump to a page
          <select
            value={active}
            onChange={(e) => { setActive(e.target.value); setNonce(Date.now()); }}
            className="max-w-[200px] rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] font-semibold text-slate-700"
          >
            {groups.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((it) => (
                  <option key={it.href} value={it.href}>{it.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          onClick={() => setNonce(Date.now())}
          title="Reload the preview with the latest access"
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
        >↻ Refresh</button>
        <a href={src} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] font-semibold text-slate-400 hover:text-brand-navy">Open in new tab ↗</a>
      </div>
      <iframe
        key={src}
        src={src}
        title={`${firstName}'s view of ${activeLabel}`}
        className="h-[640px] w-full bg-white"
      />
    </div>
  );
}
