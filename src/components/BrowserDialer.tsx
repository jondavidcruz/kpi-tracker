"use client";
// In-browser Telnyx dialer (Jon 2026-10-07: "call from Chrome, not my cell").
// Flow: fetch a short-lived WebRTC token from /api/telnyx/token (which
// self-provisions the Telnyx side on first use) → connect → dial the seller →
// live call controls (mute / hang up / timer) → the call logs itself on the
// lead's timeline with its duration.
import { useEffect, useRef, useState } from "react";
import { logBrowserCallAction } from "@/app/crm/actions";

type CallState = "idle" | "connecting" | "ringing" | "active" | "ended" | "error";

export default function BrowserDialer({ oppId, contactId, phone }: { oppId: string; contactId: string; phone: string }) {
  const [state, setState] = useState<CallState>("idle");
  const [msg, setMsg] = useState("");
  const [muted, setMuted] = useState(false);
  const [secs, setSecs] = useState(0);
  const clientRef = useRef<{ disconnect: () => void } | null>(null);
  const callRef = useRef<{ hangup: () => void; muteAudio: () => void; unmuteAudio: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { // unmount cleanup
    if (timerRef.current) clearInterval(timerRef.current);
    try { callRef.current?.hangup(); } catch { /* gone */ }
    try { clientRef.current?.disconnect(); } catch { /* gone */ }
  }, []);

  const endLog = (why: string) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const dur = startedRef.current ? Math.round((Date.now() - startedRef.current) / 1000) : 0;
    setState("ended");
    setMsg(dur ? `Call ended · ${Math.floor(dur / 60)}m ${dur % 60}s` : why);
    const fd = new FormData();
    fd.set("oppId", oppId);
    fd.set("contactId", contactId);
    fd.set("secs", String(dur));
    fd.set("to", phone);
    logBrowserCallAction(fd).catch(() => {});
    setTimeout(() => setState("idle"), 2500);
  };

  const call = async () => {
    setState("connecting");
    setMsg("Connecting…");
    try {
      const tr = await fetch("/api/telnyx/token", { method: "POST" });
      const tj = (await tr.json()) as { token?: string; callerId?: string; error?: string };
      if (!tr.ok || !tj.token) { setState("error"); setMsg(tj.error ?? "Token failed"); return; }
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      const client = new TelnyxRTC({ login_token: tj.token });
      clientRef.current = client as never;
      client.on("telnyx.ready", () => {
        setMsg("Dialing seller…");
        setState("ringing");
        const call = client.newCall({ destinationNumber: phone, callerNumber: tj.callerId || undefined, audio: true, video: false });
        callRef.current = call as never;
      });
      client.on("telnyx.error", (e: unknown) => { setState("error"); setMsg(`Telnyx: ${String((e as { message?: string })?.message ?? e).slice(0, 140)}`); });
      client.on("telnyx.notification", (n: { type: string; call?: { state?: string; remoteStream?: MediaStream } }) => {
        const cs = n.call?.state ?? "";
        if (n.type === "callUpdate") {
          if (cs === "active") {
            if (!startedRef.current) {
              startedRef.current = Date.now();
              timerRef.current = setInterval(() => setSecs(Math.round((Date.now() - startedRef.current) / 1000)), 1000);
            }
            setState("active");
            setMsg("");
            if (audioRef.current && n.call?.remoteStream) { audioRef.current.srcObject = n.call.remoteStream; audioRef.current.play().catch(() => {}); }
          }
          if (["hangup", "destroy"].includes(cs)) endLog("Call ended");
        }
      });
      client.connect();
    } catch (e) {
      setState("error");
      setMsg(String(e).slice(0, 140));
    }
  };

  const hangup = () => { try { callRef.current?.hangup(); } catch { endLog("ended"); } };
  const toggleMute = () => {
    if (!callRef.current) return;
    if (muted) callRef.current.unmuteAudio(); else callRef.current.muteAudio();
    setMuted(!muted);
  };

  if (!phone) return null;
  return (
    <span className="flex items-center gap-1.5">
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />
      {state === "idle" || state === "error" || state === "ended" ? (
        <button onClick={call} title="Call this seller from your browser — headset/mic, Telnyx line, auto-logged" className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">🎧 Call from browser</button>
      ) : (
        <span className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 ring-1 ring-emerald-300">
          <span className="text-xs font-bold text-emerald-800">{state === "active" ? `🟢 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "📡 " + state}</span>
          {state === "active" && <button onClick={toggleMute} className={`rounded-md px-2 py-1 text-[10px] font-bold ${muted ? "bg-amber-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{muted ? "🔇 muted" : "🎙 mute"}</button>}
          <button onClick={hangup} className="rounded-md bg-red-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-700">⏹ hang up</button>
        </span>
      )}
      {msg && <span className="max-w-[240px] text-[10px] font-semibold text-amber-700">{msg}</span>}
    </span>
  );
}
