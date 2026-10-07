"use client";
// GHL-style phone (top right): type any number, call it from the browser.
import { useRef, useState } from "react";

type CallState = "idle" | "connecting" | "ringing" | "active" | "error";

export default function DialPad() {
  const [open, setOpen] = useState(false);
  const [num, setNum] = useState("");
  const [state, setState] = useState<CallState>("idle");
  const [msg, setMsg] = useState("");
  const [secs, setSecs] = useState(0);
  const clientRef = useRef<{ disconnect: () => void } | null>(null);
  const callRef = useRef<{ hangup: () => void } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const hangup = () => { try { callRef.current?.hangup(); } catch { /* gone */ } finish(); };
  const finish = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    try { clientRef.current?.disconnect(); } catch { /* gone */ }
    setState("idle");
    startRef.current = 0;
  };

  const call = async () => {
    const to = num.replace(/[^+\d]/g, "");
    if (to.length < 10) { setMsg("enter a full number"); return; }
    setState("connecting");
    setMsg("Connecting…");
    try {
      const tr = await fetch("/api/telnyx/token", { method: "POST" });
      const tj = (await tr.json()) as { token?: string; callerId?: string; error?: string };
      if (!tr.ok || !tj.token) { setState("error"); setMsg(tj.error ?? "token failed"); return; }
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      const client = new TelnyxRTC({ login_token: tj.token });
      clientRef.current = client as never;
      client.on("telnyx.ready", () => {
        setState("ringing");
        setMsg("Ringing…");
        callRef.current = client.newCall({ destinationNumber: to, callerNumber: tj.callerId || undefined, audio: true, video: false }) as never;
      });
      client.on("telnyx.error", (e: unknown) => { setState("error"); setMsg(String((e as { message?: string })?.message ?? e).slice(0, 120)); });
      client.on("telnyx.notification", (n: { type: string; call?: { state?: string; remoteStream?: MediaStream } }) => {
        const cs = n.call?.state ?? "";
        if (n.type !== "callUpdate") return;
        if (cs === "active") {
          if (!startRef.current) {
            startRef.current = Date.now();
            timerRef.current = setInterval(() => setSecs(Math.round((Date.now() - startRef.current) / 1000)), 1000);
          }
          setState("active");
          setMsg("");
          if (audioRef.current && n.call?.remoteStream) { audioRef.current.srcObject = n.call.remoteStream; audioRef.current.play().catch(() => {}); }
        }
        if (["hangup", "destroy"].includes(cs)) { setMsg("Call ended"); finish(); }
      });
      client.connect();
    } catch (e) { setState("error"); setMsg(String(e).slice(0, 120)); }
  };

  return (
    <span className="relative">
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />
      <button onClick={() => setOpen((v) => !v)} title="Phone — dial any number from your browser" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">📞 Phone</button>
      {open && (
        <span className="absolute right-0 top-9 z-30 flex w-64 flex-col gap-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Dial from the browser</span>
          <input
            value={num}
            onChange={(e) => setNum(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && state === "idle") call(); }}
            placeholder="+1 (555) 123-4567"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold tracking-wide"
          />
          {state === "idle" || state === "error" ? (
            <button onClick={call} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700">📞 Call</button>
          ) : (
            <span className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 ring-1 ring-emerald-300">
              <span className="text-sm font-bold text-emerald-800">{state === "active" ? `🟢 ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : `📡 ${state}`}</span>
              <button onClick={hangup} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700">⏹ end</button>
            </span>
          )}
          {msg && <span className="text-[10px] font-semibold text-amber-700">{msg}</span>}
          <span className="text-[9px] text-slate-400">Calls from a lead&apos;s card log to its timeline — this pad is for one-off dials.</span>
        </span>
      )}
    </span>
  );
}
