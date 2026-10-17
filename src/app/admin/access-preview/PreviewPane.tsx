"use client";
// 🕵️ Member Preview pane (Jon 2026-10-16: "when I click these tabs I want it to
// open in the same screen to mirror exactly how that user would see what they
// have access to"). The left column is the teammate's REAL sidebar (only the
// items they can see); clicking one loads that real page in the iframe on the
// right with ?viewas=<id>, so it renders AS that teammate — their menu, their
// hidden money, their access redirects. Read-only: server actions never
// impersonate (the proxy only honors ?viewas on GET).
import { useState } from "react";

type Item = { href: string; label: string };
type Group = { group: string; items: Item[] };

export default function PreviewPane({
  userId, firstName, groups, startHref,
}: { userId: string; firstName: string; groups: Group[]; startHref: string }) {
  const [active, setActive] = useState<string>(startHref);
  const src = `${active}?viewas=${userId}`;
  const activeLabel = groups.flatMap((g) => g.items).find((i) => i.href === active)?.label ?? active;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* sidebar mockup — the teammate's real nav */}
      <div className="w-60 shrink-0 self-start overflow-hidden rounded-xl bg-brand-navy p-3 text-white shadow-lg">
        <div className="mb-3 px-1 text-sm font-extrabold tracking-tight">🏠 Freedom Offers</div>
        <div className="max-h-[560px] space-y-2.5 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="mb-0.5 px-1 text-[9px] font-bold uppercase tracking-wider text-white/40">{g.group}</div>
              {g.items.map((it) => (
                <button
                  key={it.href}
                  onClick={() => setActive(it.href)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition ${active === it.href ? "bg-white/15 font-semibold text-white" : "text-white/85 hover:bg-white/10"}`}
                  title={`View ${it.label} as ${firstName}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${active === it.href ? "bg-brand-gold" : "bg-brand-gold/70"}`} /> {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* embedded screen — the real page rendered AS the teammate */}
      <div className="min-w-0 flex-1 overflow-hidden rounded-xl ring-1 ring-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <span className="flex h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="truncate text-[12px] font-semibold text-slate-600">Viewing <b>{activeLabel}</b> as {firstName}</span>
          <a href={src} target="_blank" rel="noopener noreferrer" className="ml-auto shrink-0 text-[11px] font-semibold text-slate-400 hover:text-brand-navy">Open in new tab ↗</a>
        </div>
        <iframe
          key={src}
          src={src}
          title={`${firstName}'s view of ${activeLabel}`}
          className="h-[560px] w-full bg-white"
        />
      </div>
    </div>
  );
}
