"use client";
// 🔎 Type-to-search box (Jon 2026-11-05: "I don't want to press Search — search as I type").
// Generic: keeps every OTHER query param on the current page and just updates `param` (default
// "q") after a short debounce, resetting pagination. Drop it in anywhere a manual search <form>
// + Search button lived.
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function LiveSearch({
  initial = "",
  param = "q",
  placeholder = "🔎 Search…",
  className = "min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm",
  resetParam = "p",
  delay = 350,
}: {
  initial?: string;
  param?: string;
  placeholder?: string;
  className?: string;
  resetParam?: string; // pagination param to clear on a new search ("" to keep)
  delay?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [v, setV] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const p = new URLSearchParams(Array.from(sp.entries()));
      if (v.trim()) p.set(param, v.trim()); else p.delete(param);
      if (resetParam) p.delete(resetParam);
      const qs = p.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, delay);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      placeholder={placeholder}
      aria-label="Search"
      className={className}
    />
  );
}
