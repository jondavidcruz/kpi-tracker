"use client";

import { useRef, useState } from "react";

// The call-transcript field: paste text, OR upload a recording and Gemini
// transcribes it straight into the box. The audio is never stored — it's sent
// to /api/transcribe, transcribed in memory, and discarded.
export default function TranscriptField({ inputCls, geminiConfigured }: { inputCls: string; geminiConfigured: boolean }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "info" | "ok" | "err" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 18 * 1024 * 1024) {
      setMsg({ text: "That recording is over 18 MB — please trim or compress it first.", tone: "err" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setMsg({ text: `Transcribing “${f.name}” with Gemini… this can take 10–40 seconds.`, tone: "info" });
    try {
      const fd = new FormData();
      fd.append("audio", f);
      const r = await fetch("/api/transcribe", { method: "POST", body: fd });
      const d = await r.json();
      if (d.transcript) {
        setValue((v) => (v.trim() ? v.trim() + "\n\n" + d.transcript : d.transcript));
        setMsg({ text: "✓ Transcript ready — give it a quick read, then Score this call.", tone: "ok" });
      } else {
        setMsg({ text: d.error || "Couldn't transcribe that file.", tone: "err" });
      }
    } catch {
      setMsg({ text: "Upload failed — check your connection and try again.", tone: "err" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const toneCls = msg?.tone === "ok" ? "text-emerald-600" : msg?.tone === "err" ? "text-red-600" : "text-slate-500";

  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Call transcript</span>
      {geminiConfigured && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? "Transcribing…" : "🎙️ Upload a recording"}
          </button>
          {msg ? <span className={`text-xs ${toneCls}`}>{msg.text}</span> : <span className="text-xs text-slate-400">mp3, m4a, wav… the recording isn&apos;t saved anywhere.</span>}
        </div>
      )}
      <textarea
        name="transcript"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={8}
        placeholder={geminiConfigured ? "Upload a recording above to auto-transcribe — or paste a transcript here…" : "Paste the full call transcript here…"}
        className={inputCls}
      />
    </label>
  );
}
