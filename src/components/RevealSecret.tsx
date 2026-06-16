"use client";

import { useState } from "react";

/** Reveals a software password on demand: fetches the decrypted value from the
 *  audited API, shows it with copy, then auto-hides after 30s. The plaintext is
 *  only ever in memory here — never rendered into the page HTML. */
export default function RevealSecret({ id }: { id: string }) {
  const [val, setVal] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/secret/${id}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || "error");
        return;
      }
      setVal(d.secret);
      setTimeout(() => setVal(null), 30000);
    } catch {
      setErr("network error");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (val == null) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can select manually */
    }
  }

  if (val !== null) {
    return (
      <span className="inline-flex items-center gap-2">
        <code className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[13px] text-emerald-300">{val}</code>
        <button type="button" onClick={copy} className="text-xs font-semibold text-brand-navy hover:underline">{copied ? "copied!" : "copy"}</button>
        <button type="button" onClick={() => setVal(null)} className="text-xs text-slate-400 hover:underline">hide</button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={reveal}
      disabled={loading}
      className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
    >
      {loading ? "…" : "🔓 Reveal"}
      {err && <span className="ml-1 text-red-600">· {err}</span>}
    </button>
  );
}
