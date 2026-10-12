"use client";
// 🎙 Record-your-own voicemail drop (Jon 2026-10-12): the rep records up to
// 45s in the browser; we re-encode to WAV (16kHz mono — Telnyx-playable),
// store it, and the 📼 VM button plays THEIR voice into answering machines.
import { useEffect, useRef, useState } from "react";

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const wStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wStr(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); wStr(8, "WAVE");
  wStr(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wStr(36, "data"); v.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++, o += 2) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

export default function VmRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "processing" | "preview" | "saving">("idle");
  const [savedUrl, setSavedUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const wavRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/telnyx/vmdrop").then(async (r) => {
      if (!r.ok) return;
      const j = (await r.json()) as { audioUrl?: string };
      if (j.audioUrl) setSavedUrl(j.audioUrl);
    }).catch(() => {});
  }, []);

  const start = async () => {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recRef.current = rec; chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("processing");
        try {
          const webm = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
          const ctx = new AudioContext();
          const decoded = await ctx.decodeAudioData(await webm.arrayBuffer());
          const rate = 16000;
          const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
          const src = off.createBufferSource();
          src.buffer = decoded; src.connect(off.destination); src.start();
          const rendered = await off.startRendering();
          const wav = encodeWav(rendered.getChannelData(0), rate);
          wavRef.current = wav;
          setPreview(URL.createObjectURL(wav));
          setState("preview");
          ctx.close().catch(() => {});
        } catch { setErr("Couldn't process the recording — try again."); setState("idle"); }
      };
      rec.start();
      setSecs(0); setState("recording");
      timerRef.current = setInterval(() => setSecs((n) => {
        if (n + 1 >= 45) stop();
        return n + 1;
      }), 1000);
    } catch { setErr("🎤 Microphone blocked — allow it (padlock icon → Microphone) and retry."); }
  };
  const stop = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { recRef.current?.stop(); } catch { /* done */ }
  };
  const save = async () => {
    if (!wavRef.current) return;
    setState("saving");
    const fd = new FormData();
    fd.set("audio", wavRef.current, "voicemail.wav");
    const r = await fetch("/api/telnyx/vmdrop", { method: "PUT", body: fd }).catch(() => null);
    const j = r && r.ok ? ((await r.json()) as { audioUrl?: string }) : null;
    if (j?.audioUrl) { setSavedUrl(j.audioUrl); setPreview(""); wavRef.current = null; setState("idle"); }
    else { setErr("Save failed — try again."); setState("preview"); }
  };
  const removeSaved = async () => {
    await fetch("/api/telnyx/vmdrop", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearAudio: true }) }).catch(() => {});
    setSavedUrl("");
  };

  return (
    <div className="space-y-2.5">
      {savedUrl && state === "idle" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <span className="text-xs font-bold text-emerald-700">✅ Your recorded voicemail is active</span>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls preload="none" src={savedUrl} className="h-9" />
          <button onClick={removeSaved} className="text-[11px] font-bold text-red-500 hover:text-red-700">✕ remove (falls back to the written script)</button>
        </div>
      )}
      {state === "idle" && <button onClick={start} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700">🎙 {savedUrl ? "Re-record" : "Record"} my voicemail (max 45s)</button>}
      {state === "recording" && (
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-extrabold text-red-600 ring-1 ring-red-200"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> recording… {secs}s</span>
          <button onClick={stop} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">⏹ Stop</button>
        </div>
      )}
      {state === "processing" && <p className="text-xs font-bold text-slate-500">processing audio…</p>}
      {(state === "preview" || state === "saving") && preview && (
        <div className="flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={preview} className="h-9" />
          <button onClick={save} disabled={state === "saving"} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{state === "saving" ? "Saving…" : "✅ Use this"}</button>
          <button onClick={() => { setPreview(""); wavRef.current = null; setState("idle"); }} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">↺ Redo</button>
        </div>
      )}
      {err && <p className="text-xs font-bold text-red-500">{err}</p>}
      <p className="text-[11px] text-slate-400">When you hit an answering machine on a call, tap <b>📼 VM</b> — this recording plays into their voicemail in your own voice and the call hangs up for you. No recording saved? The written script (Dialer tab) is read by a natural voice instead.</p>
    </div>
  );
}
