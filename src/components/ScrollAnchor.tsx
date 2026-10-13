"use client";
// ⬇️ Keeps the conversation scrolled to the newest message (Jon 2026-10-13:
// "always show the latest update"). Scrolls its parent scroll-container to the
// bottom on mount and whenever the thread key changes.
import { useEffect, useRef } from "react";

export default function ScrollAnchor({ dep }: { dep?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // jump to the bottom without smooth animation on load
    el.scrollIntoView({ block: "end" });
    const parent = el.parentElement;
    if (parent) parent.scrollTop = parent.scrollHeight;
  }, [dep]);
  return <div ref={ref} />;
}
