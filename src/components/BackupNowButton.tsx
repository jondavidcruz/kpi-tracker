"use client";

import { useState } from "react";

// "Backup now" for the Vetted Buyers header — runs the buyer backup-to-Drive
// and shows the result inline (counts + where it landed).
export default function BackupNowButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);

  async function run() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/backup?buyers=1");
      const j = await res.json();
      if (j.ok) {
        setMsg({
          ok: true,
          text: `✓ ${j.buyers} buyers · ${j.maps} maps · ${j.historyRows} history rows → ${j.target === "drive" ? "Google Drive" : "Supabase backups/"}`,
          link: j.link,
        });
      } else {
        setMsg({ ok: false, text: `Backup failed: ${j.warning || j.error || res.status}` });
      }
    } catch (e) {
      setMsg({ ok: false, text: `Backup failed: ${String(e).slice(0, 120)}` });
    } finally { setBusy(false); }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
        {busy ? "Backing up…" : "⬇ Backup now"}
      </button>
      {msg && (
        <span className={`text-xs font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`}>
          {msg.text}{msg.link && <> · <a href={msg.link} target="_blank" rel="noopener noreferrer" className="underline">open folder ↗</a></>}
        </span>
      )}
    </span>
  );
}
