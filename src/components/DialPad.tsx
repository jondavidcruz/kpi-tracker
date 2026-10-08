"use client";
// GHL-style softphone (Jon 2026-10-07: "make it as similar to GoHighLevel").
// Keypad · Recents · Contacts · Queue tabs, a "Calling From" selector with
// automatic local presence (dials from our Telnyx number closest to the
// contact's area code), and it answers "fo-call" events from opportunity
// cards so every 📞 in the CRM rings through the browser — never tel:.
import { useEffect, useRef, useState } from "react";
import { logBrowserCallAction, dialerOutcomeQuickAction } from "@/app/crm/actions";

type CallState = "idle" | "connecting" | "ringing" | "active" | "error";
type PhoneData = {
  numbers: string[]; defaultFrom: string;
  recents: Array<{ name: string; phone: string; contactId: string; when: string; body: string }>;
  contacts: Array<{ id: string; name: string; phone: string }>;
  queue: Array<{ oppId: string; contactId: string; name: string; phone: string; title: string; due: string }>;
};
type Ctx = { phone: string; name?: string; oppId?: string; contactId?: string };

const areaCode = (e164: string) => e164.replace(/\D/g, "").replace(/^1/, "").slice(0, 3);

export default function DialPad() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"keypad" | "recents" | "contacts" | "queue">("keypad");
  const [num, setNum] = useState("");
  const [from, setFrom] = useState<string>("auto");
  const [data, setData] = useState<PhoneData | null>(null);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<CallState>("idle");
  const [msg, setMsg] = useState("");
  const [secs, setSecs] = useState(0);
  const [muted, setMuted] = useState(false);
  const [autoNext, setAutoNext] = useState(false);
  const [qi, setQi] = useState(0);
  const [onCall, setOnCall] = useState<Ctx | null>(null);
  const [lastCall, setLastCall] = useState<Ctx | null>(null); // outcome strip target
  const [incoming, setIncoming] = useState<{ number: string } | null>(null);
  const incomingCallRef = useRef<{ answer: () => void; hangup: () => void } | null>(null);
  const readyRef = useRef(false);
  const connectingRef = useRef<Promise<unknown> | null>(null);
  const clientRef = useRef<{ disconnect: () => void } | null>(null);
  const callRef = useRef<{ hangup: () => void; muteAudio: () => void; unmuteAudio: () => void; dtmf?: (digit: string) => void } | null>(null);
  const [dtmfTrail, setDtmfTrail] = useState("");
  const dialStartRef = useRef(0); // when the attempt began (ring OR answer)
  const [endConfirm, setEndConfirm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoNextRef = useRef(false);
  const qiRef = useRef(0);
  const dataRef = useRef<PhoneData | null>(null);
  const stateRef = useRef<CallState>("idle");
  autoNextRef.current = autoNext; qiRef.current = qi; dataRef.current = data; stateRef.current = state;

  // 🔔 Audible ringback while we wait (Telnyx early media often stays silent
  // until answer): classic US dual-tone 440+480 Hz, 2s on / 4s off.
  const ringCtx = useRef<{ ctx: AudioContext; gain: GainNode; timer: ReturnType<typeof setInterval> } | null>(null);
  useEffect(() => {
    const stop = () => {
      if (!ringCtx.current) return;
      clearInterval(ringCtx.current.timer);
      try { ringCtx.current.ctx.close(); } catch { /* done */ }
      ringCtx.current = null;
    };
    if (state === "ringing" || state === "connecting" || incoming) {
      if (ringCtx.current) return;
      try {
        const ctx = new AudioContext();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(ctx.destination);
        for (const f of [440, 480]) {
          const o = ctx.createOscillator();
          o.frequency.value = f;
          o.connect(gain);
          o.start();
        }
        const pulse = () => {
          const t = ctx.currentTime;
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.setValueAtTime(0, t + 2);
        };
        pulse();
        const timer = setInterval(pulse, 6000);
        ringCtx.current = { ctx, gain, timer };
      } catch { /* no audio context — silent ring */ }
    } else stop();
    return stop;
  }, [state, incoming]);

  const load = async (q = "") => {
    try {
      const r = await fetch(`/api/crm/phone${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (r.ok) setData(await r.json());
    } catch { /* panel still dials */ }
  };
  useEffect(() => { if (open && !data) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // opportunity-card 📞 buttons land here
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as Ctx;
      setOpen(true);
      setTab("keypad");
      setNum(d.phone);
      if (!dataRef.current) load();
      setTimeout(() => call(d), 350);
    };
    window.addEventListener("fo-call", h);
    return () => window.removeEventListener("fo-call", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickFrom = (to: string): string | undefined => {
    const d = dataRef.current;
    if (from !== "auto") return from;
    if (!d) return undefined;
    const ac = areaCode(to);
    return d.numbers.find((n) => areaCode(n) === ac) ?? d.defaultFrom ?? d.numbers[0];
  };

  const finish = (ctx: Ctx | null) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const dur = startRef.current ? Math.round((Date.now() - startRef.current) / 1000) : 0;
    startRef.current = 0;
    setState("idle"); setMuted(false); setSecs(0); setOnCall(null); setDtmfTrail("");
    if (ctx?.oppId) setLastCall(ctx);
    if (ctx?.contactId) {
      const fd = new FormData();
      fd.set("oppId", ctx.oppId ?? "");
      fd.set("contactId", ctx.contactId);
      fd.set("secs", String(dur));
      fd.set("to", ctx.phone);
      logBrowserCallAction(fd).catch(() => {});
    }
    setMsg(dur ? `Ended · ${Math.floor(dur / 60)}m ${dur % 60}s` : "Call ended");
    // power mode: auto-advance the queue
    if (autoNextRef.current && dataRef.current?.queue.length) {
      const next = qiRef.current + 1;
      if (next < dataRef.current.queue.length) {
        setQi(next);
        const t = dataRef.current.queue[next];
        setMsg(`Next: ${t.name} in 3s…`);
        setTimeout(() => { if (autoNextRef.current) call({ phone: t.phone, name: t.name, oppId: t.oppId, contactId: t.contactId }); }, 3000);
      } else { setAutoNext(false); setMsg("🎉 Queue finished"); }
    }
  };

  // One persistent connection: dialing uses it AND it keeps listening for
  // INBOUND calls (sellers calling our number ring right here in the browser).
  const ensureClient = async (): Promise<unknown> => {
    if (clientRef.current && readyRef.current) return clientRef.current;
    if (connectingRef.current) return connectingRef.current;
    connectingRef.current = (async () => {
      const tr = await fetch("/api/telnyx/token", { method: "POST" });
      const tj = (await tr.json()) as { token?: string; error?: string };
      if (!tr.ok || !tj.token) throw new Error(tj.error ?? "token failed");
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      const client = new TelnyxRTC({ login_token: tj.token });
      clientRef.current = client as never;
      await new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("connect timeout")), 12000);
        client.on("telnyx.ready", () => { clearTimeout(to); readyRef.current = true; resolve(); });
        client.on("telnyx.error", (e: unknown) => { setMsg(String((e as { message?: string })?.message ?? e).slice(0, 120)); });
        client.on("telnyx.socket.close", () => { readyRef.current = false; connectingRef.current = null; });
        client.on("telnyx.notification", (n: { type: string; call?: { state?: string; direction?: string; remoteStream?: MediaStream; options?: { remoteCallerNumber?: string }; answer?: () => void; hangup?: () => void } }) => {
          if (n.type !== "callUpdate" || !n.call) return;
          const cs = n.call.state ?? "";
          const inbound = n.call.direction === "inbound";
          if (inbound && cs === "ringing") {
            incomingCallRef.current = n.call as never;
            setIncoming({ number: n.call.options?.remoteCallerNumber ?? "unknown" });
            setOpen(true);
            return;
          }
          if (cs === "active") {
            setIncoming(null);
            if (!startRef.current) {
              startRef.current = Date.now();
              timerRef.current = setInterval(() => setSecs(Math.round((Date.now() - startRef.current) / 1000)), 1000);
            }
            setState("active"); setMsg("");
            if (audioRef.current && n.call.remoteStream) { audioRef.current.srcObject = n.call.remoteStream; audioRef.current.play().catch(() => {}); }
          }
          if (["hangup", "destroy"].includes(cs)) {
            if (inbound && incomingCallRef.current) { incomingCallRef.current = null; setIncoming(null); }
            finish(onCallRef.current);
          }
        });
        client.connect();
      });
      return client;
    })();
    try { return await connectingRef.current; } finally { if (!readyRef.current) connectingRef.current = null; }
  };
  const onCallRef = useRef<Ctx | null>(null);
  useEffect(() => { onCallRef.current = onCall; }, [onCall]);
  // connect in the background so inbound calls ring even before first use,
  // and keep the registration alive (tokens/sockets expire quietly).
  useEffect(() => {
    ensureClient().catch(() => { /* connects on first dial instead */ });
    const keep = setInterval(() => { if (!readyRef.current) ensureClient().catch(() => {}); }, 240_000);
    return () => clearInterval(keep);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answerIncoming = () => { try { (incomingCallRef.current as { answer: () => void } | null)?.answer(); setOnCall({ phone: incoming?.number ?? "" }); } catch { /* gone */ } };
  const declineIncoming = () => { try { incomingCallRef.current?.hangup(); } catch { /* gone */ } incomingCallRef.current = null; setIncoming(null); };

  const call = async (ctx: Ctx) => {
    const to = ctx.phone.replace(/[^+\d]/g, "");
    if (to.replace(/\D/g, "").length < 10) { setMsg("enter a full number"); return; }
    setOnCall(ctx); setState("connecting"); setMsg(`Calling ${ctx.name ?? to}…`);
    dialStartRef.current = Date.now(); setEndConfirm(false);
    try {
      const client = (await ensureClient()) as { newCall: (o: object) => unknown };
      setState("ringing");
      callRef.current = client.newCall({ destinationNumber: to, callerNumber: pickFrom(to), audio: true, video: false }) as never;
    } catch (e) { setState("error"); setMsg(String(e).slice(0, 120)); }
  };

  const hangup = () => {
    // 💸 Telnyx surcharges calls ≤6s (Jon 2026-10-07: weekly short-duration
    // flag emails). Hanging up a LIVE call inside 8s asks for one more click;
    // connecting/failed states end immediately (those aren't billed calls).
    const elapsed = dialStartRef.current ? Date.now() - dialStartRef.current : 99_000;
    if (!endConfirm && elapsed < 8_000 && (stateRef.current === "active" || stateRef.current === "ringing")) {
      setEndConfirm(true);
      setMsg("💸 Under 8s — short calls get surcharged. Press ⏹ again to end anyway.");
      setTimeout(() => setEndConfirm(false), 4000);
      return;
    }
    setEndConfirm(false);
    // Red stop must ALWAYS end it — even mid-connect before a call object
    // exists (that was the dead button): hang up if we can, then force-finish.
    try { callRef.current?.hangup(); } catch { /* already gone */ }
    callRef.current = null;
    setTimeout(() => { if (stateRef.current !== "idle") finish(onCall); }, 800);
    if (!callRef.current && (stateRef.current === "connecting" || stateRef.current === "error")) finish(onCall);
  };
  const toggleMute = () => { if (!callRef.current) return; if (muted) callRef.current.unmuteAudio(); else callRef.current.muteAudio(); setMuted(!muted); };
  // Mid-call, keypad presses must be TOUCH-TONES (phone trees, extensions,
  // "press 1" voicemail menus) — not edits to the dial box.
  const key = (k: string) => {
    if (callRef.current && (stateRef.current === "active" || stateRef.current === "ringing")) {
      try { callRef.current.dtmf?.(k); } catch { /* tone lost, keep UI honest anyway */ }
      setDtmfTrail((v) => (v + k).slice(-20));
    } else setNum((v) => v + k);
  };

  const TabBtn = ({ id, icon, label }: { id: typeof tab; icon: string; label: string }) => (
    <button onClick={() => { setTab(id); if (id === "contacts" || id === "recents" || id === "queue") load(search); }} className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] font-bold ${tab === id ? "bg-slate-100 text-slate-800" : "text-slate-400 hover:text-slate-600"}`}>
      <span className="text-[15px]">{icon}</span>{label}
    </button>
  );

  return (
    <span className="relative">
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />
      <button onClick={() => setOpen((v) => !v)} title="Phone — call from your browser" className={`grid h-8 w-8 place-items-center rounded-full text-sm ${state === "active" ? "bg-emerald-500 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>📞</button>
      {open && (
        <span className="absolute right-0 top-10 z-40 flex w-[300px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {/* header: Calling From */}
          <span className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <span>
              <span className="block text-[13px] font-extrabold text-slate-800">Calling From</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 w-44 rounded-md border border-slate-200 px-1 py-0.5 text-[10px] font-semibold text-slate-600">
                <option value="auto">📍 Closest to the contact (auto)</option>
                {(data?.numbers ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </span>
            <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500">✕</button>
          </span>

          {incoming && (
            <span className="flex items-center gap-2 bg-emerald-600 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-100">📲 Incoming call</span>
                <span className="block truncate text-sm font-extrabold text-white">{incoming.number}</span>
              </span>
              <button onClick={answerIncoming} className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg text-emerald-700 shadow hover:bg-emerald-50" title="Answer">📞</button>
              <button onClick={declineIncoming} className="grid h-10 w-10 place-items-center rounded-full bg-red-600 text-lg text-white shadow hover:bg-red-700" title="Decline">⏹</button>
            </span>
          )}
          {/* live call bar */}
          {state !== "idle" && (
            <span className="relative mb-4 flex items-center gap-2 bg-emerald-50 px-3.5 py-2 ring-1 ring-emerald-200">
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-emerald-800">
                {state === "active" ? `🟢 ${onCall?.name ?? onCall?.phone} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : `📡 ${state} — ${onCall?.name ?? onCall?.phone ?? ""}`}
                {dtmfTrail && <span className="ml-1 rounded bg-white px-1 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">⌨ {dtmfTrail}</span>}
              </span>
              {endConfirm && <span className="absolute -bottom-5 left-3 right-3 truncate text-[9px] font-bold text-red-600">💸 short calls get surcharged — press ⏹ again to end</span>}
              {state === "active" && <button onClick={toggleMute} className={`rounded-md px-2 py-1 text-[10px] font-bold ${muted ? "bg-amber-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{muted ? "🔇" : "🎙"}</button>}
              <button onClick={hangup} title="End the call" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-600 text-base text-white shadow hover:bg-red-700">⏹</button>
            </span>
          )}
          {msg && state === "idle" && <span className="px-3.5 py-1 text-[10px] font-semibold text-amber-700">{msg}</span>}

          {/* body */}
          <span className="max-h-[360px] min-h-[280px] overflow-y-auto px-3.5 py-2.5">
            {tab === "keypad" && (
              <span className="flex flex-col items-center gap-2">
                <input value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && state === "idle") call({ phone: num }); }} placeholder="+1 (555) 123-4567" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-center text-base font-bold tracking-wider" />
                <span className="grid w-full grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
                    <button key={k} onClick={() => key(k)} className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700 hover:bg-slate-200">{k}</button>
                  ))}
                </span>
                <span className="flex w-full items-center justify-center gap-4 pt-1">
                  {state === "idle" ? (
                    <button onClick={() => call({ phone: num })} className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-xl text-white hover:bg-emerald-600">📞</button>
                  ) : (
                    <button onClick={hangup} title="End the call" className="grid h-12 w-12 place-items-center rounded-full bg-red-600 text-xl text-white shadow hover:bg-red-700">⏹</button>
                  )}
                  <button onClick={() => setNum((v) => v.slice(0, -1))} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">⌫</button>
                </span>
              </span>
            )}
            {tab === "recents" && (
              <span className="flex flex-col gap-1">
                {(data?.recents ?? []).map((r, i) => (
                  <button key={i} onClick={() => r.phone && call({ phone: r.phone, name: r.name, contactId: r.contactId })} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-[10px] font-extrabold text-indigo-600">{r.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">{r.name}</span>
                      <span className="block text-[10px] text-slate-400">{r.phone} · {new Date(r.when).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                    <span className="text-emerald-500">📞</span>
                  </button>
                ))}
                {!data?.recents.length && <span className="py-8 text-center text-xs text-slate-400">No calls yet today.</span>}
              </span>
            )}
            {tab === "contacts" && (
              <span className="flex flex-col gap-1">
                <input value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} placeholder="🔎 Search for contacts" className="mb-1 w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs" />
                {(data?.contacts ?? []).map((c) => (
                  <button key={c.id} onClick={() => call({ phone: c.phone, name: c.name, contactId: c.id })} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-50 text-[10px] font-extrabold text-violet-600">{c.name.split(" ").map((x) => x[0]).join("").slice(0, 2).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">{c.name}</span>
                      <span className="block text-[10px] text-slate-400">{c.phone}</span>
                    </span>
                    <span className="text-emerald-500">📞</span>
                  </button>
                ))}
              </span>
            )}
            {tab === "queue" && (
              <span className="flex flex-col gap-1">
                {lastCall && state === "idle" && (
                  <span className="mb-1 flex flex-col gap-1 rounded-xl bg-amber-50 px-2.5 py-2 ring-1 ring-amber-200">
                    <span className="text-[10px] font-bold text-amber-800">How did it go with {lastCall.name ?? lastCall.phone}?</span>
                    <span className="flex flex-wrap gap-1">
                      {([["no_answer", "📵 No answer"], ["voicemail", "📼 VM"], ["callback", "📞 Callback"], ["talked", "✅ Talked"], ["not_interested", "🌱 Nurture"]] as const).map(([k, l]) => (
                        <button key={k} onClick={() => {
                          const fd = new FormData();
                          fd.set("oppId", lastCall.oppId ?? "");
                          fd.set("contactId", lastCall.contactId ?? "");
                          fd.set("outcome", k);
                          dialerOutcomeQuickAction(fd).catch(() => {});
                          setLastCall(null);
                          setTimeout(() => load(), 800);
                        }} className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">{l}</button>
                      ))}
                      <button onClick={() => setLastCall(null)} className="ml-auto text-[10px] text-slate-400 hover:text-slate-600">skip</button>
                    </span>
                  </span>
                )}
                <span className="mb-1 flex items-center justify-between rounded-xl bg-emerald-50 px-2.5 py-1.5 ring-1 ring-emerald-200">
                  <span className="text-[10px] font-bold text-emerald-800">⚡ Power mode: auto-dials the next lead when you hang up</span>
                  <button onClick={() => { const on = !autoNext; setAutoNext(on); if (on && data?.queue[qi] && state === "idle") { const t = data.queue[qi]; call({ phone: t.phone, name: t.name, oppId: t.oppId, contactId: t.contactId }); } }} className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${autoNext ? "bg-emerald-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{autoNext ? "ON" : "OFF"}</button>
                </span>
                {(data?.queue ?? []).map((t, i) => (
                  <button key={t.oppId} onClick={() => { setQi(i); call({ phone: t.phone, name: t.name, oppId: t.oppId, contactId: t.contactId }); }} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 ${i === qi && autoNext ? "bg-emerald-50 ring-1 ring-emerald-200" : ""}`}>
                    <span className="w-4 text-[10px] font-extrabold text-slate-400">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-bold text-slate-800">{t.name}</span>
                      <span className="block truncate text-[10px] text-slate-400">{t.title} · due {t.due}</span>
                    </span>
                    <span className="text-emerald-500">📞</span>
                  </button>
                ))}
                {!data?.queue.length && <span className="py-8 text-center text-xs text-slate-400">Queue clear 🎉 Follow-ups land here when due.</span>}
                <span className="pt-1 text-center text-[9px] text-slate-400">One line at a time. Mass triple-line dialing stays in Direct REI (carrier compliance).</span>
              </span>
            )}
          </span>

          {/* bottom tabs — GHL style */}
          <span className="flex gap-1 border-t border-slate-100 px-2 py-1.5">
            <TabBtn id="recents" icon="🕐" label="Recents" />
            <TabBtn id="contacts" icon="👤" label="Contacts" />
            <TabBtn id="keypad" icon="🔢" label="Keypad" />
            <TabBtn id="queue" icon="⚡" label="Dialer" />
          </span>
        </span>
      )}
    </span>
  );
}
