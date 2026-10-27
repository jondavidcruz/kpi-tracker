"use client";
// GHL-style softphone (Jon 2026-10-07: "make it as similar to GoHighLevel").
// Keypad · Recents · Contacts · Queue tabs, a "Calling From" selector with
// automatic local presence (dials from our Telnyx number closest to the
// contact's area code), and it answers "fo-call" events from opportunity
// cards so every 📞 in the CRM rings through the browser — never tel:.
import { useEffect, useRef, useState } from "react";
import { logBrowserCallAction, dialerOutcomeQuickAction, logCallTypeKpiAction } from "@/app/crm/actions";
import { quietHoursWarning } from "@/lib/npa-tz";

type CallState = "idle" | "connecting" | "ringing" | "active" | "error";
type PhoneData = {
  numbers: string[]; defaultFrom: string;
  recents: Array<{ name: string; phone: string; contactId: string; when: string; body: string }>;
  contacts: Array<{ id: string; name: string; phone: string }>;
  queue: Array<{ oppId: string; contactId: string; name: string; phone: string; title: string; due: string }>;
};
type Ctx = { phone: string; name?: string; oppId?: string; contactId?: string; dir?: "in" | "out"; secs?: number };

const areaCode = (e164: string) => e164.replace(/\D/g, "").replace(/^1/, "").slice(0, 3);

export default function DialPad({ floating = false }: { floating?: boolean } = {}) {
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
  const [incoming, setIncoming] = useState<{ number: string; name?: string; deptLabel?: string } | null>(null);
  const [answeredBy, setAnsweredBy] = useState<{ agent: string; caller: string } | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null); // null = unknown
  const claimUntilRef = useRef(0); // while fresh, the next native ring auto-answers here
  const ringStartRef = useRef(0); // when THIS inbound call began ringing — a claim must be newer
  const meFirstRef = useRef("");
  const mePosRef = useRef("");
  const [typeLogged, setTypeLogged] = useState("");
  // after a ring ends without ME answering, find out who took it (brief race
  // with the webhook write, so wait a beat)
  const checkWhoAnswered = () => {
    setTimeout(async () => {
      try {
        const r = await fetch("/api/crm/callerid?last=1", { cache: "no-store" });
        const j = (await r.json()) as { at?: string; agent?: string; from?: string; callerName?: string };
        if (j.at && j.agent && Date.now() - Date.parse(j.at) < 90_000) {
          setAnsweredBy({ agent: `${j.agent[0].toUpperCase()}${j.agent.slice(1)}`, caller: j.callerName || j.from || "" });
          setTimeout(() => setAnsweredBy(null), 8000);
        }
      } catch { /* cosmetic */ }
    }, 1500);
  };
  // 📣 cross-tab ring (Jon 2026-10-12: Sharyn heard her OTHER tab ringing but
  // saw nothing on the tab she was looking at): the leader tab broadcasts
  // incoming calls to every sibling tab; any tab can answer/decline remotely.
  const [remoteIncoming, setRemoteIncoming] = useState<{ number: string } | null>(null);
  const [standby, setStandby] = useState(false);
  const bcRef = useRef<BroadcastChannel | null>(null);
  const [lineOk, setLineOk] = useState(false); // 🟢 socket registered = inbound will ring here
  const incomingCallRef = useRef<{ answer: () => void; hangup: () => void } | null>(null);
  const readyRef = useRef(false);
  const connectingRef = useRef<Promise<unknown> | null>(null);
  const clientRef = useRef<{ disconnect: () => void } | null>(null);
  const callRef = useRef<{ hangup: () => void; muteAudio: () => void; unmuteAudio: () => void; dtmf?: (digit: string) => void } | null>(null);
  const [dtmfTrail, setDtmfTrail] = useState("");
  // 🔊 Local keypad feedback (Jon 2026-10-26): play the real DTMF dual-tone + flash the
  // pressed key so it mirrors a physical phone. (The call's own dtmf() still sends the tone
  // to the far end for phone trees; this is the sound + light the CALLER hears/sees.)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playDtmf = (k: string) => {
    const F: Record<string, [number, number]> = {
      "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
      "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
      "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
      "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
    };
    const pair = F[k]; if (!pair) return;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = audioCtxRef.current ?? (audioCtxRef.current = new AC());
      if (ctx.state === "suspended") void ctx.resume();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      gain.connect(ctx.destination);
      for (const freq of pair) { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = freq; o.connect(gain); o.start(now); o.stop(now + 0.24); }
    } catch { /* no audio context — stay silent, UI still flashes */ }
  };
  const flashKey = (k: string) => { setPressedKey(k); if (pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current = setTimeout(() => setPressedKey(null), 160); };
  const dialStartRef = useRef(0); // when the attempt began (ring OR answer)
  const [endConfirm, setEndConfirm] = useState(false);
  // 🕐 Device-clock skew vs the server (Jon 2026-10-24): a wrong computer clock
  // made Michelle's calls get falsely blocked by the quiet-hours guard. We measure
  // the offset once and (a) correct the guard with it, (b) warn her to fix the clock.
  const [clockSkew, setClockSkew] = useState(0); // serverNow - clientNow, ms
  const clockSkewRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const recStartedRef = useRef(false); // 🎙 did we already start recording this outbound call?
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const keepAliveRef = useRef<HTMLAudioElement | null>(null);
  // 🔇 anti-discard: Chrome's Memory Saver unloads idle tabs, killing the
  // phone socket — THE reason inbound went user_busy while the tab sat idle
  // (Jon 2026-10-09). A looping near-silent tone marks the tab as "playing
  // audio", which exempts it from discard. Starts on registration; if
  // autoplay is blocked, retries on the first click anywhere.
  const keepTabAlive = () => {
    try {
      if (keepAliveRef.current) return;
      // ⚠️ NEVER a looping audio FILE here: a zero-length looping clip made the
      // browser seek forever — pegged CPUs, froze tabs, dropped Jon's Meet
      // (2026-10-09). A live silent oscillator stream costs ~nothing.
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.0001; // inaudible, but counts as "playing audio" → no tab discard
      const dst = ctx.createMediaStreamDestination();
      osc.connect(g); g.connect(dst); osc.start();
      const a = new Audio();
      a.srcObject = dst.stream;
      keepAliveRef.current = a;
      a.play().catch(() => {
        const once = () => { a.play().catch(() => {}); ctx.resume().catch(() => {}); document.removeEventListener("pointerdown", once); };
        document.addEventListener("pointerdown", once);
      });
    } catch { /* tab discard protection is best-effort */ }
  };
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
        let timer: ReturnType<typeof setInterval>;
        if (incoming) {
          // 📲 INCOMING ringtone (Jon 2026-10-11: "an actual ringtone — calming
          // but alerting", not the outbound ringback): a soft 4-note chime,
          // E5→G#5→B5→E6, bell-like envelopes, repeating every 2.6s.
          const chime = () => {
            const notes = [659.25, 830.61, 987.77, 1318.51];
            notes.forEach((f, i) => {
              const t0 = ctx.currentTime + i * 0.22;
              const o = ctx.createOscillator();
              const g = ctx.createGain();
              o.type = "sine"; o.frequency.value = f;
              g.gain.setValueAtTime(0, t0);
              g.gain.linearRampToValueAtTime(0.14, t0 + 0.03);
              g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
              o.connect(g); g.connect(ctx.destination);
              o.start(t0); o.stop(t0 + 0.65);
            });
          };
          chime();
          timer = setInterval(chime, 2600);
        } else {
          // 🔔 outbound ringback — classic US dual-tone 440+480, 2s on / 4s off
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
          timer = setInterval(pulse, 6000);
        }
        ringCtx.current = { ctx, gain, timer };
      } catch { /* no audio context — silent ring */ }
    } else stop();
    return stop;
  }, [state, incoming]);

  // let the auto-updater know a call is live (never reload mid-call)
  useEffect(() => {
    (window as unknown as { __fo_on_call?: boolean }).__fo_on_call = state !== "idle" || !!incoming || !!remoteIncoming;
  }, [state, incoming, remoteIncoming]);

  const load = async (q = "") => {
    try {
      const r = await fetch(`/api/crm/phone${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      if (r.ok) { const j = await r.json() as PhoneData; dataRef.current = j; setData(j); return j; } // set the ref NOW so a call fired before render can pick a from-number
    } catch { /* panel still dials */ }
    return null;
  };
  useEffect(() => { if (open && !data) load(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🕐 measure the clock skew (round-trip compensated). RE-measures every 60s and
  // returns the fresh value, so when a rep FIXES their clock the warning clears on
  // its own and a call always uses the current offset — not a stale one from page
  // load (Jon 2026-10-24: Michelle fixed her clock but the tab still said 3h off).
  const measureSkew = async (): Promise<number> => {
    try {
      const t0 = Date.now();
      const r = await fetch("/api/now", { cache: "no-store" });
      if (!r.ok) return clockSkewRef.current;
      const { now } = await r.json();
      const t1 = Date.now();
      const skew = now - (t0 + (t1 - t0) / 2); // server - client midpoint
      if (Number.isFinite(skew)) { clockSkewRef.current = skew; setClockSkew(skew); return skew; }
    } catch { /* offline — keep last known */ }
    return clockSkewRef.current;
  };
  useEffect(() => {
    measureSkew();
    // 💸 Clock drift doesn't change minute-to-minute — re-check every 10 min, not every 60s, so
    // /api/now isn't hit by every user on every page all day (Vercel free-tier economy, Jon
    // 2026-10-26). A call re-reads the current offset regardless, so this is just the safety net.
    const id = setInterval(measureSkew, 600_000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const clockOff = Math.abs(clockSkew) > 5 * 60_000; // >5 min = materially wrong
  const clockOffLabel = () => { const m = Math.round(Math.abs(clockSkew) / 60000); const h = Math.floor(m / 60); const mm = m % 60; return `${h ? `${h}h ` : ""}${mm}m ${clockSkew > 0 ? "behind" : "ahead"}`; };

  // opportunity-card 📞 buttons land here
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as Ctx;
      d.phone = String(d.phone || "").replace(/\.\d+$/, ""); // drop ".0" import artifact
      setOpen(true);
      setTab("keypad");
      setNum(d.phone);
      if (!dataRef.current) load();
      setTimeout(() => call(d), 350);
    };
    window.addEventListener("fo-call", h);
    return () => window.removeEventListener("fo-call", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Pick the caller-ID number. "auto" = the one closest to the lead (same area
  // code); if NONE is close, we still pick one — our default line, else the first
  // available — so a call never silently fails for lack of a nearby number (Jon
  // 2026-10-24). A manually-chosen number is used as-is, but still falls back to an
  // available number if that pick isn't in our list.
  const pickFrom = (to: string): string | undefined => {
    const d = dataRef.current;
    const nums = d?.numbers ?? [];
    if (from !== "auto") return from; // a manually-chosen line is used as-is
    if (!nums.length) return d?.defaultFrom || undefined; // nothing loaded/available → let Telnyx use the line default
    const ac = areaCode(to);
    return nums.find((n) => areaCode(n) === ac)   // closest (same area code)
      ?? (d?.defaultFrom && nums.includes(d.defaultFrom) ? d.defaultFrom : undefined) // our default line
      ?? nums[0];                                  // else ANY available number — never fail
  };

  const finish = (ctx: Ctx | null) => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    const dur = startRef.current ? Math.round((Date.now() - startRef.current) / 1000) : 0;
    startRef.current = 0;
    setState("idle"); setMuted(false); setSecs(0); setOnCall(null); setDtmfTrail(""); recStartedRef.current = false;
    if (ctx?.oppId || ctx?.contactId || ctx?.phone) setLastCall({ ...ctx, secs: dur }); // keypad dials get the strip too (Jon 2026-10-09)
    if (ctx?.phone || ctx?.contactId) {
      // log EVERY call — keypad dials included; the server find-or-creates the
      // contact so it shows in Conversations recents (Jon 2026-10-08)
      const fd = new FormData();
      fd.set("oppId", ctx.oppId ?? "");
      fd.set("contactId", ctx.contactId ?? "");
      fd.set("secs", String(dur));
      fd.set("to", ctx.phone ?? "");
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

  // 👑 ONE phone per browser (Jon 2026-10-09): multiple War Room tabs were
  // logging into the same Telnyx credential and kicking each other off every
  // few minutes — the line was mid-reconnect whenever a call arrived, so
  // inbound hit user_busy instantly. A Web Lock elects ONE leader tab to hold
  // the phone; the rest stand down. Dialing from another tab steals the lock.
  const leaderRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const holdLock = (steal: boolean) => {
    if (!("locks" in navigator)) { leaderRef.current = true; return Promise.resolve(); }
    return new Promise<void>((acquired) => {
      navigator.locks.request("fo_dialer_leader", steal ? { steal: true } : {}, async () => {
        leaderRef.current = true;
        setStandby(false);
        try { localStorage.setItem("fo_phone_hb", String(Date.now())); } catch { /* fine */ }
        acquired();
        ensureClient().catch(() => {});
        await new Promise<void>((res) => { releaseRef.current = res; });
      }).catch(() => {
        // our lock was STOLEN (user dialed from another tab) → stand down and
        // queue up again so we take over if that tab ever closes
        leaderRef.current = false;
        setStandby(true);
        try { (clientRef.current as { disconnect?: () => void } | null)?.disconnect?.(); } catch { /* gone */ }
        clientRef.current = null; readyRef.current = false; setLineOk(false);
        acquired();
        holdLock(false);
      });
    });
  };

  // One persistent connection: dialing uses it AND it keeps listening for
  // INBOUND calls (sellers calling our number ring right here in the browser).
  const ensureClient = async (): Promise<unknown> => {
    if (!leaderRef.current) throw new Error("phone is live in another tab");
    if (clientRef.current && readyRef.current) return clientRef.current;
    if (connectingRef.current) return connectingRef.current;
    connectingRef.current = (async () => {
      const tr = await fetch("/api/telnyx/token", { method: "POST" });
      const tj = (await tr.json()) as { token?: string; error?: string };
      if (!tr.ok || !tj.token) throw new Error(tj.error ?? "token failed");
      const { TelnyxRTC } = await import("@telnyx/webrtc");
      // prefetchIceCandidates: without it some networks sit in ICE gathering
      // for ~30s before the INVITE leaves the browser — Jon's "didn't ring on
      // my phone until 30 seconds later" (2026-10-08).
      const client = new TelnyxRTC({ login_token: tj.token, prefetchIceCandidates: true } as ConstructorParameters<typeof TelnyxRTC>[0]);
      clientRef.current = client as never;
      await new Promise<void>((resolve, reject) => {
        const to = setTimeout(() => reject(new Error("connect timeout")), 12000);
        client.on("telnyx.ready", () => { clearTimeout(to); readyRef.current = true; setLineOk(true); fetch("/api/telnyx/presence", { method: "POST" }).catch(() => {}); keepTabAlive(); resolve(); });
        client.on("telnyx.error", (e: unknown) => { setMsg(String((e as { message?: string })?.message ?? e).slice(0, 120)); });
        client.on("telnyx.socket.close", () => {
          readyRef.current = false; setLineOk(false); connectingRef.current = null;
          // kicked off the line (e.g. another window took it over) → the
          // pending INVITE will never resolve here; stop the ringing UI/chime
          incomingCallRef.current = null;
          setIncoming(null);
        });
        client.on("telnyx.notification", (n: { type: string; call?: { state?: string; direction?: string; remoteStream?: MediaStream; options?: { remoteCallerNumber?: string }; answer?: () => void; hangup?: () => void } }) => {
          if (n.type !== "callUpdate" || !n.call) return;
          const cs = n.call.state ?? "";
          const inbound = n.call.direction === "inbound";
          if (inbound && cs === "ringing") {
            incomingCallRef.current = n.call as never;
            ringStartRef.current = Date.now(); // stamp this ring so only a claim filed AFTER it can auto-answer
            // ⚡ cross-profile answer: if I click Answer in ANOTHER browser
            // window (different profile), it files a claim — this ringing
            // client sees it within 2s and picks up here (audio plays via
            // this computer either way). The claim must be for THIS ring (newer
            // than ringStart): a stale claim from a PRIOR call was auto-answering
            // the next one on the previous answerer's browser, stealing it from
            // whoever actually clicked (Jon 2026-10-21: Marie clicked, Michelle connected).
            const claimPoll = setInterval(async () => {
              if (!incomingCallRef.current) { clearInterval(claimPoll); return; }
              try {
                const r = await fetch("/api/crm/callerid?claim=1", { cache: "no-store" });
                const j = (await r.json()) as { at?: string; agent?: string };
                if (j.at && j.agent === meFirstRef.current && Date.now() - Date.parse(j.at) < 12_000 && Date.parse(j.at) >= ringStartRef.current - 1500) {
                  clearInterval(claimPoll);
                  try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setMicOk(false); return; }
                  try { (incomingCallRef.current as { answer?: () => void } | null)?.answer?.(); setOnCall({ phone: "inbound", dir: "in" }); } catch { /* raced */ }
                }
              } catch { /* next tick */ }
            }, 2_000);
            setTimeout(() => clearInterval(claimPoll), 35_000);
            const number = n.call.options?.remoteCallerNumber ?? "unknown";
            setIncoming({ number });
            setOpen(true);
            try { bcRef.current?.postMessage({ t: "incoming", number }); } catch { /* same-tab only */ }
            // 🏷 caller-ID: swap the raw number for the CRM name on every tab
            fetch(`/api/crm/callerid?num=${encodeURIComponent(number)}`, { cache: "no-store" }).then(async (r) => {
              const j = (await r.json().catch(() => ({}))) as { name?: string; deptLabel?: string };
              if (j.name || j.deptLabel) {
                setIncoming((cur) => (cur && cur.number === number ? { ...cur, name: j.name ?? cur.name, deptLabel: j.deptLabel } : cur));
                try { bcRef.current?.postMessage({ t: "incoming", number, name: j.name, deptLabel: j.deptLabel }); } catch { /* fine */ }
              }
            }).catch(() => {});
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
            // 🎙 outbound WebRTC calls aren't recorded by the webhook reliably —
            // start recording here the moment it connects (Jon 2026-10-13). The
            // server also starts it as a fallback; a 2nd record_start is a no-op.
            if (onCallRef.current?.dir === "out" && !recStartedRef.current) {
              const grabId = (): string => {
                const cc = callRef.current as unknown as { telnyxIDs?: { telnyxCallControlId?: string }; options?: { telnyxCallControlId?: string }; id?: string } | null;
                return cc?.telnyxIDs?.telnyxCallControlId || cc?.options?.telnyxCallControlId || cc?.id || "";
              };
              const fire = (ccId: string) => { if (ccId && !recStartedRef.current) { recStartedRef.current = true; fetch("/api/telnyx/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callControlId: ccId }) }).catch(() => {}); } };
              const id0 = grabId();
              if (id0) fire(id0);
              else setTimeout(() => { if (stateRef.current === "active") fire(grabId()); }, 1500); // id not ready yet → retry once
            }
          }
          if (cs === "active" || ["hangup", "destroy"].includes(cs)) {
            try { bcRef.current?.postMessage({ t: "incoming-clear" }); } catch { /* fine */ }
          }
          if (["hangup", "destroy"].includes(cs)) {
            if (inbound && incomingCallRef.current) { incomingCallRef.current = null; setIncoming(null); checkWhoAnswered(); }
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
  // 📞 report busy the instant a call goes active / ends (Jon 2026-10-13) so the
  // next inbound call skips me while I'm on the phone — no 45s heartbeat lag.
  useEffect(() => {
    if (!leaderRef.current || !readyRef.current) return;
    fetch("/api/telnyx/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busy: state === "active" }) }).catch(() => {});
  }, [state]);
  // connect in the background so inbound calls ring even before first use,
  // and keep the registration alive (tokens/sockets expire quietly).
  useEffect(() => {
    holdLock(false); // leader election — the winning tab connects inside
    // 🎤 proactive mic check: answering is impossible without it
    try {
      (navigator.permissions?.query({ name: "microphone" as PermissionName }) as Promise<PermissionStatus>)?.then((st) => {
        setMicOk(st.state === "granted");
        st.onchange = () => setMicOk(st.state === "granted");
      }).catch(() => {});
    } catch { /* older browser — the answer-time prompt still covers it */ }
    fetch("/api/crm/mystats", { cache: "no-store" }).then(async (r) => {
      if (!r.ok) return;
      const j = (await r.json()) as { who?: string; position?: string };
      if (j.who) meFirstRef.current = j.who.toLowerCase();
      mePosRef.current = j.position ?? "";
    }).catch(() => {});
    // standby detection: still not the leader after 1.5s = another tab has
    // the phone; this tab shows a blue dot + remote answer banners instead
    const standbyT = setTimeout(() => { if (!leaderRef.current) setStandby(true); }, 1500);
    // cross-tab channel: leader announces rings, any tab can answer/decline
    try {
      const bc = new BroadcastChannel("fo_phone");
      bcRef.current = bc;
      bc.onmessage = (ev: MessageEvent<{ t?: string; number?: string }>) => {
        const m = ev.data ?? {};
        if (m.t === "incoming" && !leaderRef.current) { const mm = m as { name?: string; deptLabel?: string }; setRemoteIncoming({ number: [mm.name || m.number || "unknown", mm.deptLabel].filter(Boolean).join(" · ") }); setOpen(true); }
        if (m.t === "incoming-clear") { setRemoteIncoming((cur) => { if (cur) checkWhoAnswered(); return null; }); }
        if (m.t === "answer" && leaderRef.current) answerIncomingRef.current?.();
        if (m.t === "decline" && leaderRef.current) declineIncomingRef.current?.();
      };
    } catch { /* older browser — leader-tab-only ringing */ }
    // Chrome freezes timers + sockets in background tabs — the #1 reason
    // inbound went user_busy (Jon 2026-10-08). Re-register the second the tab
    // wakes, plus a tighter 60s heartbeat while visible.
    // While CONNECTED, ping presence so inbound ring-all knows this browser is
    // awake and dials it; while disconnected, keep trying to re-register.
    const keep = setInterval(() => {
      if (!leaderRef.current) {
        // 🧟 frozen-leader takeover (Jon 2026-10-12: Sharyn's ring vanished —
        // a paused tab held her phone lock): the leader stamps a heartbeat;
        // if it goes stale, a standby tab seizes the line.
        try {
          const hb = Number(localStorage.getItem("fo_phone_hb") || 0);
          if (hb && Date.now() - hb > 150_000) { localStorage.setItem("fo_phone_hb", String(Date.now())); holdLock(true); }
        } catch { /* no storage */ }
        return;
      }
      try { localStorage.setItem("fo_phone_hb", String(Date.now())); } catch { /* fine */ }
      if (!readyRef.current) ensureClient().catch(() => {});
      // report busy=true while on an ACTIVE call so inbound ring-all skips me
      else fetch("/api/telnyx/presence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ busy: stateRef.current === "active" }) }).catch(() => {});
    }, 45_000);
    const wake = () => { if (leaderRef.current && !readyRef.current) ensureClient().catch(() => {}); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    // ☎️ poll-carried ring: works across browsers/profiles where the
    // BroadcastChannel can't reach (Jon 2026-10-12 — Sharyn's case)
    const onRing = (ev: Event) => {
      const d = (ev as CustomEvent<{ from?: string; name?: string; at?: string }>).detail ?? {};
      const age = d.at ? Date.now() - Date.parse(d.at) : 99_000;
      if (age > 32_000) return;
      if (incomingCallRef.current) return; // this tab is ringing natively already
      setRemoteIncoming((cur) => cur ?? { number: d.name || d.from || "unknown" });
      setOpen(true);
      setTimeout(() => setRemoteIncoming(null), Math.max(3_000, 32_000 - age));
    };
    window.addEventListener("fo-ring", onRing);
    return () => { releaseRef.current?.(); clearInterval(keep); clearTimeout(standbyT); try { bcRef.current?.close(); } catch { /* fine */ } document.removeEventListener("visibilitychange", wake); window.removeEventListener("focus", wake); window.removeEventListener("online", wake); window.removeEventListener("fo-ring", onRing); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const answerIncoming = async () => {
    // 🎤 the #1 silent answer-killer: no mic permission (Sharyn 2026-10-12) —
    // ask for it explicitly so the browser PROMPTS instead of failing quietly
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch {
      setMsg("🎤 MICROPHONE BLOCKED — the call can't connect. Click the 🔒 padlock by the address bar → Microphone → Allow, then answer again.");
      setMicOk(false);
      return;
    }
    setMicOk(true);
    try { (incomingCallRef.current as { answer: () => void } | null)?.answer(); setOnCall({ phone: incoming?.number ?? "", dir: "in" }); } catch { /* gone */ }
  };
  const declineIncoming = () => { try { incomingCallRef.current?.hangup(); } catch { /* gone */ } incomingCallRef.current = null; setIncoming(null); try { bcRef.current?.postMessage({ t: "incoming-clear" }); } catch { /* fine */ } };
  // refs so the BroadcastChannel handler (bound once on mount) always calls
  // the latest versions
  const answerIncomingRef = useRef(answerIncoming);
  const declineIncomingRef = useRef(declineIncoming);
  answerIncomingRef.current = answerIncoming;
  declineIncomingRef.current = declineIncoming;
  const remoteAnswer = async () => {
    try { bcRef.current?.postMessage({ t: "answer" }); } catch { /* no channel */ }
    // 🎤 secure the mic NOW (user gesture) so the auto-answer can't fail on it
    try { await navigator.mediaDevices.getUserMedia({ audio: true }); setMicOk(true); }
    catch { setMicOk(false); setRemoteIncoming({ number: "🎤 mic blocked — padlock icon → Microphone → Allow, then answer again" }); setTimeout(() => setRemoteIncoming(null), 8000); return; }
    // take the phone line over INTO THIS TAB and have the server re-ring us here
    claimUntilRef.current = Date.now() + 25_000;
    try { if (!leaderRef.current) await holdLock(true); } catch { /* proceed */ }
    ensureClient().catch(() => {});
    fetch("/api/crm/callerid", { method: "POST" }).catch(() => {});
    setRemoteIncoming({ number: `✅ answering — connecting the call to THIS window…` });
    setTimeout(() => setRemoteIncoming(null), 6000);
  };
  const remoteDecline = () => { try { bcRef.current?.postMessage({ t: "decline" }); } catch { /* no channel */ } setRemoteIncoming(null); };

  const call = async (ctx: Ctx) => {
    // strip a trailing ".0" (spreadsheet-import artifact — e.g. "8184424145.0")
    // BEFORE cleaning, or the "0" after the dot sticks to the number (Jon 2026-10-24)
    const to = ctx.phone.replace(/\.\d+$/, "").replace(/[^+\d]/g, "");
    if (to.replace(/\D/g, "").length < 10) { setMsg("enter a full number"); return; }
    // 🕘 quiet-hours guard: 9pm–8am in the LEAD'S time zone (by area code) = blocked.
    // Re-measure the clock skew RIGHT NOW so a just-fixed (or just-broken) device clock
    // is reflected immediately, and use the server-corrected time for the decision.
    const skew = await measureSkew();
    const quiet = quietHoursWarning(to, undefined, Date.now() + skew);
    if (quiet) { setState("error"); setMsg(Math.abs(skew) > 5 * 60_000 ? `${quiet}  (Your computer clock is off by ${Math.round(Math.abs(skew) / 60000)}m — this used the corrected time.)` : quiet); setTimeout(() => { setState("idle"); setMsg(""); }, 7000); return; }
    setOnCall({ ...ctx, dir: "out" }); setState("connecting"); setMsg(`Calling ${ctx.name ?? to}…`);
    dialStartRef.current = Date.now(); setEndConfirm(false);
    try {
      // make sure our from-numbers are loaded (a call fired from a card 📞 before the
      // panel ever opened had no numbers → callerNumber undefined → silent no-dial). Jon 2026-10-24
      if (!dataRef.current?.numbers?.length) await load();
      // dialing from a standby tab → steal the phone from the leader tab first
      if (!leaderRef.current) { setMsg("Taking the line from your other tab…"); await holdLock(true); }
      const client = (await ensureClient()) as { newCall: (o: object) => unknown };
      setState("ringing");
      const from = pickFrom(to);
      const opts: { destinationNumber: string; callerNumber?: string; audio: boolean; video: boolean } = { destinationNumber: to, audio: true, video: false };
      if (from) opts.callerNumber = from; // omit entirely if we truly have none → Telnyx uses the connection's default line (still dials)
      callRef.current = client.newCall(opts) as never;
    } catch (e) { setState("error"); setMsg(String(e).slice(0, 120)); }
  };

  const hangup = () => {
    // 💸 HARD 8-second floor (Jon 2026-10-08, after Telnyx's abandoned-call
    // surcharge notice): a ringing or live call CANNOT be ended before 8s —
    // no override. Hanging up while ringing is exactly what Telnyx counts as
    // an "abandoned call", so the button simply counts down. Connecting /
    // failed states (no billable call yet) still end instantly.
    const elapsed = dialStartRef.current ? Date.now() - dialStartRef.current : 99_000;
    if (elapsed < 8_000 && (stateRef.current === "active" || stateRef.current === "ringing")) {
      const left = Math.ceil((8_000 - elapsed) / 1000);
      setEndConfirm(true);
      setMsg(`🔒 ${left}s — ending early counts as an abandoned call (Telnyx surcharge). Hold on…`);
      setTimeout(() => { setEndConfirm(false); setMsg(""); }, 8_000 - elapsed + 200);
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
    playDtmf(k); flashKey(k); // sound + light on every press, like a real keypad
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
    // floating = the ONE global phone: top-right on every page (Jon 2026-10-08
    // — "keep it in the top right"), ringing no matter what section you're in.
    <span className={floating ? "fixed right-4 top-3 z-50" : "relative"}>
      <audio ref={audioRef} autoPlay style={{ display: "none" }} />
      <button onClick={() => setOpen((v) => !v)} title={lineOk ? "Phone — line connected, inbound rings here" : leaderRef.current ? "Phone — reconnecting… inbound will NOT ring this tab yet" : "Phone is live in another War Room tab — dialing here takes it over"} className={`relative grid place-items-center rounded-full ${floating ? "h-10 w-10 text-base shadow-lg ring-2 ring-white/70" : "h-8 w-8 text-sm"} ${state === "active" ? "bg-emerald-500 text-white" : incoming ? "animate-pulse bg-emerald-500 text-white" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>
        📞
        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${lineOk ? "bg-emerald-400" : standby ? "bg-sky-400" : "bg-amber-400 animate-pulse"}`} />
      </button>
      {answeredBy && (
        <span className="absolute right-12 top-1 z-50 whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-lg">✅ {answeredBy.agent} answered a call from {answeredBy.caller || "unknown"}</span>
      )}
      {open && (
        <span className={`absolute z-50 flex w-[300px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 ${floating ? "right-0 top-12" : "right-0 top-10"}`}>
          {/* header: Calling From */}
          <span className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
            <span>
              <span className="block text-[13px] font-extrabold text-slate-800">Calling From</span>
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 w-52 rounded-md border border-slate-200 px-1.5 py-1 text-[13px] font-semibold text-slate-700">
                <option value="auto">📍 Closest to the contact (auto)</option>
                {(data?.numbers ?? []).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </span>
            <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-500">✕</button>
          </span>

          {clockOff && (
            <span className="block border-b border-amber-200 bg-amber-50 px-3.5 py-2 text-[11px] font-semibold text-amber-800">
              ⚠️ Your computer&apos;s clock is <b>{clockOffLabel()}</b> the real time. Calls use the corrected time so they won&apos;t be wrongly blocked — but please fix it: open your computer&apos;s Date &amp; Time settings and turn on <b>“Set time automatically.”</b>
            </span>
          )}

          {incoming && (
            <span className="flex items-center gap-2 bg-emerald-600 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-100">📲 Incoming call</span>
                <span className="block truncate text-sm font-extrabold text-white">{incoming.name ?? incoming.number}</span>
                {incoming.name && <span className="block truncate text-[10px] font-semibold text-emerald-100">{incoming.number}</span>}
                {incoming.deptLabel && <span className="mt-0.5 inline-block rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-bold text-white">{incoming.deptLabel}</span>}
              </span>
              <button onClick={answerIncoming} className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg text-emerald-700 shadow hover:bg-emerald-50" title="Answer">📞</button>
              <button onClick={declineIncoming} className="grid h-10 w-10 place-items-center rounded-full bg-red-600 text-lg text-white shadow hover:bg-red-700" title="Decline">⏹</button>
            </span>
          )}
          {!incoming && remoteIncoming && (
            <span className="flex items-center gap-2 bg-emerald-600 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-100">📲 Incoming call{remoteIncoming.number.startsWith("✅") ? "" : " (ringing in your other tab)"}</span>
                <span className="block truncate text-sm font-extrabold text-white">{remoteIncoming.number}</span>
              </span>
              {!remoteIncoming.number.startsWith("✅") && <>
                <button onClick={remoteAnswer} className="grid h-10 w-10 place-items-center rounded-full bg-white text-lg text-emerald-700 shadow hover:bg-emerald-50" title="Answer (connects in your other tab)">📞</button>
                <button onClick={remoteDecline} className="grid h-10 w-10 place-items-center rounded-full bg-red-600 text-lg text-white shadow hover:bg-red-700" title="Decline">⏹</button>
              </>}
            </span>
          )}
          {/* live call bar */}
          {state !== "idle" && (
            <span className="relative mb-4 flex items-center gap-2 bg-emerald-50 px-3.5 py-2 ring-1 ring-emerald-200">
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-emerald-800">
                {state === "active" ? `🟢 ${onCall?.name ?? onCall?.phone} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : `📡 ${state} — ${onCall?.name ?? onCall?.phone ?? ""}`}
                {dtmfTrail && <span className="ml-1 rounded bg-white px-1 py-0.5 font-mono text-[10px] text-slate-500 ring-1 ring-slate-200">⌨ {dtmfTrail}</span>}
              </span>
              {endConfirm && <span className="absolute -bottom-5 left-3 right-3 truncate text-[9px] font-bold text-red-600">🔒 under 8s — abandoned calls get surcharged; the call can be ended at 0:08</span>}
              {state === "active" && <button onClick={toggleMute} className={`rounded-md px-2 py-1 text-[10px] font-bold ${muted ? "bg-amber-500 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{muted ? "🔇" : "🎙"}</button>}
              {state === "active" && onCall?.phone && onCall.dir === "out" && (
                <button
                  onClick={async () => {
                    setMsg("📼 dropping your voicemail…");
                    try {
                      const r = await fetch("/api/telnyx/vmdrop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: onCall.phone }) });
                      if (!r.ok) { const j = (await r.json().catch(() => ({}))) as { error?: string }; setMsg(`📼 VM drop failed: ${j.error ?? r.status}`); return; }
                      try { callRef.current?.muteAudio?.(); } catch { /* best-effort */ }
                      setMsg("📼 voicemail playing — the call hangs up by itself, you're free");
                    } catch { setMsg("📼 VM drop failed — network"); }
                  }}
                  title="Hit an answering machine? Plays your saved voicemail script into the call and hangs up for you (edit the script on the Dialer tab)"
                  className="rounded-md bg-violet-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-violet-700"
                >📼 VM</button>
              )}
              <button onClick={hangup} title="End the call" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-600 text-base text-white shadow hover:bg-red-700">⏹</button>
            </span>
          )}
          {/* 📋 Call disposition (GHL-style, Jon 2026-10-08): shows after EVERY
              call ends, whatever tab is open — pick what happened. */}
          {lastCall && state === "idle" && (
            <span className="mx-2 mb-1 mt-1 flex flex-col gap-1 rounded-xl bg-amber-50 px-2.5 py-2 ring-1 ring-amber-200">
              <span className="text-[10px] font-bold text-amber-800">📋 Disposition — {lastCall.name ?? lastCall.phone}:</span>
              <span className="flex flex-wrap gap-1">
                {([["no_answer", "📵 No Answer"], ["voicemail", "📼 Voicemail"], ["follow_up", "🔁 Follow Up"], ["appointment", "📅 Appt Set"], ["talked", "✅ Talked"], ["not_interested", "🚫 Not Interested"], ["wrong_number", "❌ Wrong #"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => {
                    const fd = new FormData();
                    fd.set("oppId", lastCall.oppId ?? "");
                    fd.set("contactId", lastCall.contactId ?? "");
                    fd.set("to", lastCall.phone ?? "");
                    fd.set("outcome", k);
                    dialerOutcomeQuickAction(fd).catch(() => {});
                    setLastCall(null);
                    setTimeout(() => load(), 800);
                  }} className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">{l}</button>
                ))}
                <button onClick={() => setLastCall(null)} className="ml-auto text-[10px] text-slate-400 hover:text-slate-600">skip</button>
              </span>
              {(lastCall.secs ?? 0) >= 60 && (
                <span className="mt-1 flex flex-col gap-1 border-t border-amber-200/60 pt-1.5">
                  <span className="text-[10px] font-bold text-amber-800">🏷 What kind of call was it? <span className="font-semibold text-amber-600">(counts your KPI automatically)</span></span>
                  {typeLogged === lastCall.phone ? (
                    <span className="text-[10px] font-bold text-emerald-600">✅ logged to your scorecard</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {(mePosRef.current === "dispositions"
                        ? ([["buyer_convo", "🤝 Buyer Convo"], ["buyer_vetted", "✅ Buyer Vetted"]] as const)
                        : mePosRef.current === "acquisitions" || mePosRef.current === "cc_lm"
                        ? ([["process", "☎️ Process Call"], ["followup", "🔁 Follow-Up"], ["offer", "💰 Offer Call"]] as const)
                        : ([["process", "☎️ Process Call"], ["followup", "🔁 Follow-Up"], ["offer", "💰 Offer Call"], ["buyer_convo", "🤝 Buyer Convo"], ["buyer_vetted", "✅ Buyer Vetted"]] as const)
                      ).map(([k, l]) => (
                        <button key={k} onClick={async () => {
                          const fd = new FormData();
                          fd.set("type", k); fd.set("to", lastCall.phone ?? "");
                          const res = await logCallTypeKpiAction(fd).catch(() => ({ ok: false as const, error: "network" }));
                          if (res.ok) { setTypeLogged(lastCall.phone ?? "y"); setMsg(`✅ ${res.label}`); }
                          else setMsg(`⚠️ ${res.error ?? "couldn't log the KPI"}`);
                        }} className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100">{l}</button>
                      ))}
                    </span>
                  )}
                </span>
              )}
            </span>
          )}
          {msg && <span className="px-3.5 py-1 text-[10px] font-semibold text-amber-700">{msg}</span>}

          {/* body */}
          <span className="max-h-[360px] min-h-[280px] overflow-y-auto px-3.5 py-2.5">
            {tab === "keypad" && (
              <span className="flex flex-col items-center gap-2">
                <input value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && state === "idle") call({ phone: num }); }} placeholder="+1 (555) 123-4567" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-center text-base font-bold tracking-wider" />
                {/* 🔢 live touch-tone readout during a call — see the keys you've sent (Jon 2026-10-26) */}
                {state === "active" && dtmfTrail && <span className="font-mono text-[12px] tracking-widest text-emerald-600">⌨ {dtmfTrail}</span>}
                <span className="grid w-full grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => (
                    <button key={k} onClick={() => key(k)} className={`mx-auto grid h-12 w-12 place-items-center rounded-full text-lg font-semibold transition-transform duration-75 active:scale-90 ${pressedKey === k ? "scale-90 bg-emerald-500 text-white ring-2 ring-emerald-300" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{k}</button>
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
                {/* 📼 my voicemail-drop script (spoken into answering machines) */}
                <details className="mb-1 rounded-xl bg-violet-50 px-2.5 py-1.5 ring-1 ring-violet-200">
                  <summary className="cursor-pointer text-[10px] font-bold text-violet-800">📼 My voicemail script — one click leaves it on answering machines</summary>
                  <VmScriptEditor />
                </details>
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

          {micOk === false && (
            <button
              onClick={async () => { try { await navigator.mediaDevices.getUserMedia({ audio: true }); setMicOk(true); setMsg(""); } catch { setMsg("🎤 Still blocked — click the 🔒 padlock by the address bar → Microphone → Allow."); } }}
              className="mx-2 mb-1 rounded-xl bg-red-600 px-3 py-2 text-left text-[11px] font-extrabold text-white hover:bg-red-700"
            >🎤 Microphone is OFF in this browser — calls can ring but can&apos;t be ANSWERED. Tap here to enable it.</button>
          )}
          {/* bottom tabs — GHL style */}
          <span className="flex gap-1 border-t border-slate-100 px-2 py-1.5">
            <TabBtn id="recents" icon="🕐" label="Recents" />
            <TabBtn id="contacts" icon="👤" label="Contacts" />
            <TabBtn id="keypad" icon="🔢" label="Keypad" />
            <TabBtn id="queue" icon="⚡" label="Dialer" />
          </span>
          {/* 💡 what the dot means (Jon 2026-10-12: team-facing legend) */}
          <span className="flex items-center justify-center gap-2.5 border-t border-slate-50 bg-slate-50/60 px-2 py-1 text-[8px] font-bold text-slate-400">
            <span><span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" /> rings here</span>
            <span><span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" /> rings in your other tab</span>
            <span><span className="mr-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" /> reconnecting</span>
          </span>
        </span>
      )}
    </span>
  );
}

// 📼 per-rep voicemail-drop script editor (lives on the Dialer tab)
function VmScriptEditor() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState("");
  useEffect(() => {
    fetch("/api/telnyx/vmdrop").then(async (r) => {
      if (!r.ok) return;
      const j = (await r.json()) as { text?: string };
      if (j.text) setText(j.text);
    }).catch(() => {});
  }, []);
  return (
    <span className="mt-1.5 flex flex-col gap-1.5">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={600} className="w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-[11px]" />
      <span className="flex items-center gap-2">
        <button
          onClick={async () => {
            const r = await fetch("/api/telnyx/vmdrop", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
            setSaved(r?.ok ? "✓ saved" : "save failed");
            setTimeout(() => setSaved(""), 2500);
          }}
          className="rounded-md bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-violet-700"
        >Save script</button>
        {saved && <span className="text-[10px] font-bold text-emerald-600">{saved}</span>}
        <span className="text-[9px] text-slate-400">a natural voice reads this into the machine when you hit 📼 VM on a call</span>
      </span>
    </span>
  );
}
