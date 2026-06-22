"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A sub-nav tab bar that links related pages into one hub. */
export default function HubTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const on = path === t.href || path.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{t.label}</Link>
        );
      })}
    </div>
  );
}
