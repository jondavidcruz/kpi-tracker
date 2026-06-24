"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Upload a recording → it goes STRAIGHT to Supabase Storage (no Vercel size
// limit), gets transcribed by Gemini, and the playable URL is saved with the
// score so the team can listen back / share it.
export default function TranscriptField({ inputCls, geminiConfigured }: { inputCls: string; geminiConfigured: boolean }) {
  const [value, setValue] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "info" | "ok" | "err" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 200 * 1024 * 1024) {
      setMsg({ text: "That recording is over 200 MB — please trim or compress it first.", tone: "err" });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setAudioUrl("");
    setMsg({ text: `Uploading “${f.name}”…`, tone: "info" });
    try {
      const ext = (f.name.split(".").pop() || "m4a").toLowerCase();
      // 1) Get a one-time signed URL, then upload straight to storage (no Vercel limit).
      const signRes = await fetch("/api/recording-upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ext }) });
      const sign = await signRes.json();
      if (sign.path && sign.token) {
        const supabase = createClient();
        const { error: upErr } = await supabase.storage.from("call-recordings").uploadToSignedUrl(sign.path, sign.token, f);
        if (upErr) throw new Error("storage upload failed");
        const url = sign.publicUrl as string;
        setAudioUrl(url);
        if (!geminiConfigured) {
          setMsg({ text: "✓ Recording saved — now paste the transcript below, then Score this call.", tone: "ok" });
        } else {
          // 2) Transcribe from the stored URL.
          setMsg({ text: "Transcribing with Gemini… 10–40 seconds.", tone: "info" });
          const r = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
          const d = await r.json();
          if (d.transcript) {
            setValue((v) => (v.trim() ? v.trim() + "\n\n" + d.transcript : d.transcript));
            setMsg({ text: "✓ Uploaded + transcribed — read it, then Score this call.", tone: "ok" });
          } else {
            setMsg({ text: (d.error || "Couldn't transcribe that file.") + " (Recording saved — you can still paste a transcript.)", tone: "err" });
          }
        }
      } else {
        // Fallback: storage not set up → small files only, posted straight to transcribe.
        if (f.size > 4 * 1024 * 1024) {
          setMsg({ text: sign.error || "Recording storage isn't set up — ask an admin to add SUPABASE_SERVICE_ROLE_KEY so large files upload.", tone: "err" });
          return;
        }
        setMsg({ text: "Transcribing with Gemini…", tone: "info" });
        const fd = new FormData(); fd.append("audio", f);
        const r = await fetch("/api/transcribe", { method: "POST", body: fd });
        const d = await r.json();
        if (d.transcript) { setValue((v) => (v.trim() ? v.trim() + "\n\n" + d.transcript : d.transcript)); setMsg({ text: "✓ Transcript ready — read it, then Score this call.", tone: "ok" }); }
        else setMsg({ text: d.error || "Couldn't transcribe that file.", tone: "err" });
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
      <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Call recording <span className="text-red-500">(required)</span> + transcript</span>
      <div className={`mb-2 flex flex-wrap items-center gap-2 ${audioUrl ? "" : "rounded-lg bg-red-50 p-2 ring-1 ring-red-200"}`}>
        <input ref={fileRef} type="file" accept="audio/*" onChange={onFile} className="hidden" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {busy ? "Working…" : audioUrl ? "🎙️ Replace recording" : "🎙️ Upload the recording"}
        </button>
        {msg ? <span className={`text-xs ${toneCls}`}>{msg.text}</span>
          : audioUrl ? <span className="text-xs text-emerald-600">✓ Recording attached.</span>
          : <span className="text-xs font-semibold text-red-600">Required — upload the audio file (mp3, m4a, wav…). A transcript alone won&apos;t save.</span>}
      </div>
      {audioUrl && <audio controls src={audioUrl} className="mb-2 h-9 w-full max-w-md" />}
      <input type="hidden" name="audioUrl" value={audioUrl} />
      <textarea name="transcript" value={value} onChange={(e) => setValue(e.target.value)} rows={8}
        placeholder={geminiConfigured ? "Upload a recording above to auto-transcribe — or paste a transcript here…" : "Paste the full call transcript here…"}
        className={inputCls} />
    </label>
  );
}
