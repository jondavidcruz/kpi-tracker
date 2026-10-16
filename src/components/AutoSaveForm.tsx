"use client";
// 💾 Autosave wrapper (Jon 2026-10-16: "reps forgot to press save home details
// and it did not save"). Wrap any server-action form in this and it saves itself
// — on blur when a field changes, after a short pause when typing, and on leaving
// the page — so a rep never loses what they entered by forgetting the Save button.
// The explicit Save button still works as a manual fallback. Read-only data is
// never touched; this only submits the form it wraps.
import { useEffect, useRef, useState, type ReactNode } from "react";

type Status = "idle" | "unsaved" | "saving" | "saved";

export default function AutoSaveForm({
  action, children, className, debounceMs = 1200,
}: { action: (fd: FormData) => void | Promise<void>; children: ReactNode; className?: string; debounceMs?: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const submit = () => {
    if (!dirtyRef.current || !formRef.current) return;
    dirtyRef.current = false;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setStatus("saving");
    formRef.current.requestSubmit();
    // The server action re-renders the tree; show "saved" shortly after.
    setTimeout(() => setStatus((s) => (s === "saving" ? "saved" : s)), 700);
  };

  const onInput = () => {
    dirtyRef.current = true;
    setStatus("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(submit, debounceMs);
  };

  // Flush on leaving the field (blur) and when the page is hidden / unloaded.
  useEffect(() => {
    const flush = () => submit();
    const onHide = () => { if (document.visibilityState === "hidden") submit(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => { window.removeEventListener("pagehide", flush); document.removeEventListener("visibilitychange", onHide); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form ref={formRef} action={action} className={className}
      onInput={onInput}
      onChange={onInput}
      onBlurCapture={() => { if (dirtyRef.current) submit(); }}
      onSubmit={() => { dirtyRef.current = false; }}
    >
      {children}
      <div className="mt-1 h-3 text-[10px] font-semibold">
        {status === "unsaved" && <span className="text-amber-500">● editing…</span>}
        {status === "saving" && <span className="text-sky-500">saving…</span>}
        {status === "saved" && <span className="text-emerald-600">✓ saved automatically</span>}
      </div>
    </form>
  );
}
