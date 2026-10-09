"use client";
// 🔔 Inbox bell v4 (Jon 2026-10-09): clicking the bell ALWAYS opens an iPhone.
// Inside the phone: a real Messages list (recent threads, blue dot = unread),
// tap one → the thread in bubbles with a typing bar INSIDE the phone + a
// from-number picker above it. Soft two-tone ding on NEW texts only.
import { useEffect, useRef, useState, useTransition } from "react";
import { sendCrmSmsAction } from "@/app/crm/actions";

type Thread = { id: string; name: string; phone: string; owner: string; snippet: string; at: string; unread?: boolean };
type QuickThread = { id: string; name: string; phone: string; oppId: string; history: Array<{ body: string; inbound: boolean; at: string }>; me: string };

function fmtPhone(n: string) {
  const d = n.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}
function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

export default function InboxBell() {
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<Thread[]>([]);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [quick, setQuick] = useState<QuickThread | null>(null);
  const [threadErr, setThreadErr] = useState("");
  const [loading, setLoading] = useState("");
  // list filters (Jon 2026-10-09): All / Unread / ⭐ Starred + search-anyone
  const [view, setView] = useState<"all" | "unread" | "star">("all");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Thread[]>([]);
  const [stars, setStars] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setStars(JSON.parse(localStorage.getItem("fo_bell_star") ?? "{}")); } catch { /* none */ } }, []);
  const toggleStar = (id: string) => setStars((s) => {
    const next = { ...s, [id]: !s[id] };
    if (!next[id]) delete next[id];
    try { localStorage.setItem("fo_bell_star", JSON.stringify(next)); } catch { /* fine */ }
    return next;
  });
  // debounce the contact search so typing doesn't hammer the API
  useEffect(() => {
    if (query.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/unread?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
        const j = (await r.json()) as { contacts?: Array<{ id: string; name: string; phone: string }> };
        setFound((j.contacts ?? []).map((c) => ({ id: c.id, name: c.name, phone: c.phone, owner: "", snippet: c.phone ? fmtPhone(c.phone) : "", at: "" })));
      } catch { /* search is best-effort */ }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  // composer state lives up here so switching threads resets cleanly
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  const [numbers, setNumbers] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<QuickThread["history"]>([]);
  const [pending, start] = useTransition();
  const prevRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const threadRef = useRef<HTMLSpanElement>(null);
  const newToRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [msgs.length, quick?.id]);

  const ding = () => {
    try {
      const ctx = new AudioContext();
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      gain.connect(ctx.destination);
      for (const [f, t] of [[880, 0], [1175, 0.12]] as const) {
        const o = ctx.createOscillator();
        o.type = "sine"; o.frequency.value = f;
        o.connect(gain); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.35);
      }
      setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch { /* badge still updates */ }
  };

  const poll = async () => {
    try {
      const r = await fetch("/api/crm/unread", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { count: number; recent?: Thread[] };
      setCount(j.count); setRecent(j.recent ?? []);
      // ding ONLY when (a) mute is off RIGHT NOW in storage — mutedRef goes
      // stale when the mute was toggled in another tab — and (b) the newest
      // unread is actually fresh; overnight syncs re-flagging old threads
      // bumped the count and made "random" dings (Jon 2026-10-09).
      let mutedNow = mutedRef.current;
      try { mutedNow = localStorage.getItem("fo_bell_muted") === "1"; } catch { /* keep ref */ }
      const newestUnread = (j.recent ?? []).filter((t) => t.unread).map((t) => t.at).sort().pop();
      const fresh = !!newestUnread && Date.now() - Date.parse(newestUnread) < 3 * 60_000;
      if (prevRef.current !== null && j.count > prevRef.current && fresh && !mutedNow) ding();
      prevRef.current = j.count;
      document.title = document.title.replace(/^\(\d+\) /, "");
      if (j.count > 0) document.title = `(${j.count}) ${document.title}`;
    } catch { /* next tick */ }
  };

  useEffect(() => {
    try { if (localStorage.getItem("fo_bell_muted") === "1") { setMuted(true); mutedRef.current = true; } } catch { /* on */ }
    poll();
    fetch("/api/crm/phone").then(async (r) => {
      if (!r.ok) return;
      const j = (await r.json()) as { numbers?: string[] };
      if (j.numbers?.length) setNumbers(j.numbers);
    }).catch(() => {});
    const t = setInterval(poll, 45_000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleMute = () => {
    const next = !muted;
    setMuted(next); mutedRef.current = next;
    try { localStorage.setItem("fo_bell_muted", next ? "1" : "0"); } catch { /* fine */ }
  };
  const markAll = async () => {
    await fetch("/api/crm/unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "readall" }) }).catch(() => {});
    setCount(0); setRecent((rs) => rs.map((r) => ({ ...r, unread: false }))); prevRef.current = 0;
    document.title = document.title.replace(/^\(\d+\) /, "");
  };
  const openThread = async (id: string) => {
    setThreadErr(""); setLoading(id);
    try {
      const r = await fetch(`/api/crm/unread?thread=${id}`, { cache: "no-store" });
      if (!r.ok) { setThreadErr("Couldn't load that thread — use Open Conversations below."); setLoading(""); return; }
      const q = (await r.json()) as QuickThread;
      setQuick(q); setMsgs(q.history); setText("");
      setRecent((rs) => rs.map((t) => (t.id === id ? { ...t, unread: false } : t)));
      setCount((c) => Math.max(0, c - (recent.find((t) => t.id === id)?.unread ? 1 : 0)));
    } catch { setThreadErr("Couldn't load that thread — use Open Conversations below."); }
    setLoading("");
  };
  const send = () => {
    const body = text.trim();
    if (!body || pending || !quick) return;
    const fd = new FormData();
    fd.set("oppId", quick.oppId); fd.set("contactId", quick.id); fd.set("to", quick.phone); fd.set("text", body);
    if (from) fd.set("from", from);
    start(async () => {
      await sendCrmSmsAction(fd);
      setMsgs((m) => [...m, { body, inbound: false, at: new Date().toISOString() }]);
      setText("");
    });
  };

  const first = quick ? quick.name.split(" ")[0] || "them" : "";

  return (
    <span className="fixed right-16 top-3 z-50">
      <button onClick={() => setOpen((v) => !v)} title="Texts — click to open your phone"
        className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-base shadow-lg ring-1 ring-slate-200 hover:bg-slate-50">
        {muted ? "🔕" : "🔔"}
        {count > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-0.5 text-[9px] font-extrabold text-white">{count}</span>}
        {muted && <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded bg-slate-700 px-1 text-[7px] font-extrabold uppercase tracking-wide text-white">muted</span>}
      </button>
      {open && (
        <span className="absolute right-0 top-12 flex w-[300px] max-w-[92vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
          {/* panel header */}
          <span className="flex items-center gap-1.5 border-b border-slate-100 px-3 py-2">
            <span className="text-[12px] font-extrabold text-slate-800">📱 Texts</span>
            {quick && <a href={`/crm/conversations?c=${quick.id}`} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700 hover:bg-slate-200">full thread ↗</a>}
            <span className="ml-auto flex gap-1">
              {!quick && count > 0 && <button onClick={markAll} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">✓ all read</button>}
              <button onClick={toggleMute} title={muted ? "Chime is off — click to turn on" : "Chime is on — click to mute"} className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-200">{muted ? "🔕 muted" : "🔔 on"}</button>
              <button onClick={() => { setOpen(false); setQuick(null); }} className="px-1 text-slate-300 hover:text-slate-500">✕</button>
            </span>
          </span>
          {threadErr && <span className="px-3 py-1 text-[10px] font-bold text-red-500">{threadErr}</span>}
          {/* from-number picker — only when inside a thread */}
          {quick && (
            <span className="flex items-center justify-center gap-1.5 px-3 pt-2 text-[10px] font-bold text-slate-500">
              Texting from
              <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold">
                <option value="">Default line</option>
                {numbers.map((n) => <option key={n} value={n}>{fmtPhone(n)}</option>)}
              </select>
            </span>
          )}
          {/* 📱 THE PHONE — always on screen */}
          <span className="block p-3">
            <span className="mx-auto block w-[250px] rounded-[2.4rem] bg-slate-900 p-2 shadow-xl">
              <span className="block overflow-hidden rounded-[1.9rem] bg-white">
                <span className="flex items-center justify-between px-5 pt-2 text-[9px] font-bold text-slate-900"><span>9:41</span><span>📶 🔋</span></span>
                {quick ? (
                  <>
                    {/* thread header */}
                    <span className="flex items-center border-b border-slate-100 pb-1.5 pt-0.5">
                      <button onClick={() => setQuick(null)} className="px-2 text-[16px] font-bold text-sky-500">‹</button>
                      <span className="block flex-1 pr-6 text-center">
                        <span className="mx-auto grid h-7 w-7 place-items-center rounded-full bg-slate-300 text-[10px] font-bold text-white">{(quick.name[0] ?? "?").toUpperCase()}</span>
                        <span className="mt-0.5 block text-[9px] font-semibold text-slate-800">{first} · {fmtPhone(quick.phone)}</span>
                      </span>
                    </span>
                    <span ref={threadRef} className="flex h-[250px] flex-col gap-1 overflow-y-auto bg-white px-2.5 pb-2 pt-1">
                      <span className="mt-auto" />
                      <span className="block text-center text-[8px] font-semibold text-slate-400">Text Message · SMS</span>
                      {msgs.map((m, i) => (
                        <span key={i} className={`flex ${m.inbound ? "justify-start" : "justify-end"}`}>
                          <span className="max-w-[80%] whitespace-pre-line break-words rounded-2xl px-2.5 py-1.5 text-[11px] leading-snug" style={m.inbound ? { backgroundColor: "#e9e9eb", color: "#111", borderBottomLeftRadius: 4 } : { backgroundColor: "#34c759", color: "#fff", borderBottomRightRadius: 4 }}>{m.body}</span>
                        </span>
                      ))}
                    </span>
                    <span className="flex items-center gap-1.5 border-t border-slate-100 px-2 py-1.5">
                      <input
                        value={text} onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                        placeholder={`Text ${first}…`}
                        className="h-7 min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-3 text-[11px] outline-none focus:border-sky-300"
                      />
                      <button onClick={send} disabled={pending || !text.trim()} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-bold disabled:opacity-40" style={{ backgroundColor: "#34c759", color: "#fff" }}>{pending ? "…" : "↑"}</button>
                    </span>
                  </>
                ) : (
                  <>
                    {/* Messages list — like the real app */}
                    <span className="flex items-center justify-between border-b border-slate-100 px-3 pb-1 pt-0.5">
                      <span className="text-[15px] font-extrabold text-slate-900">Messages</span>
                      <span className="flex items-center gap-0.5">
                        {([["all", "All"], ["unread", `Unread${count ? ` ${count}` : ""}`], ["star", "⭐"]] as const).map(([k, l]) => (
                          <button key={k} onClick={() => setView(k)} className={`rounded-full px-1.5 py-0.5 text-[8px] font-extrabold ${view === k ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>
                        ))}
                        <button onClick={() => { setQuery(""); newToRef.current?.focus(); }} title="New message — type any name or phone number" className="ml-0.5 text-[13px] text-sky-500 hover:text-sky-600">✏️</button>
                      </span>
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1">
                      <span className="text-[9px] font-extrabold text-slate-400">To:</span>
                      <input ref={newToRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="name, or any phone number" className="h-6 min-w-0 flex-1 rounded-lg border border-slate-100 bg-slate-50 px-2 text-[10px] outline-none focus:border-sky-300" />
                    </span>
                    <span className="block h-[248px] overflow-y-auto">
                      {(() => {
                        const searching = query.trim().length >= 2;
                        const ql = query.trim().toLowerCase();
                        const qd = query.replace(/\D/g, "");
                        let rows = searching
                          ? [...recent.filter((t) => t.name.toLowerCase().includes(ql) || (qd.length >= 3 && t.phone.replace(/\D/g, "").includes(qd))), ...found.filter((f) => !recent.some((t) => t.id === f.id))]
                          : recent.filter((t) => (view === "unread" ? t.unread : view === "star" ? stars[t.id] : true));
                        rows = rows.slice(0, 20);
                        const phoneish = qd.length >= 10 && rows.length === 0;
                        if (rows.length === 0 && !phoneish) return <span className="block px-4 py-10 text-center text-[10px] text-slate-400">{searching ? "No match — type a full number to text it." : view === "unread" ? "Nothing unread. 🎉" : view === "star" ? "No starred chats yet — tap ☆ on any conversation." : <>No conversations yet.<br />Texts from sellers land here. 🎉</>}</span>;
                        return (
                          <>
                            {phoneish && (
                              <button onClick={async () => {
                                const r = await fetch("/api/crm/unread", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "ensure", phone: qd }) }).catch(() => null);
                                const j = r ? ((await r.json().catch(() => ({}))) as { id?: string }) : {};
                                if (j.id) { setQuery(""); openThread(j.id); }
                              }} className="flex w-full items-center gap-2 border-b border-slate-50 px-2.5 py-2.5 text-left hover:bg-emerald-50">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500 text-[13px] font-bold text-white">＋</span>
                                <span className="text-[11px] font-extrabold text-emerald-700">Text {fmtPhone(qd)}</span>
                              </button>
                            )}
                            {rows.map((t) => (
                              <span key={t.id} className="flex w-full items-center border-b border-slate-50 hover:bg-slate-50">
                                <button onClick={() => openThread(t.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left">
                                  <span className={`h-2 w-2 shrink-0 rounded-full ${t.unread ? "bg-sky-500" : "bg-transparent"}`} />
                                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-300 text-[11px] font-bold text-white">{(t.name[0] ?? "?").toUpperCase()}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className="flex items-baseline justify-between gap-1">
                                      <span className={`truncate text-[11px] ${t.unread ? "font-extrabold text-slate-900" : "font-semibold text-slate-700"}`}>{t.name}</span>
                                      <span className="shrink-0 text-[8px] text-slate-400">{loading === t.id ? "…" : t.at ? ago(t.at) : ""}</span>
                                    </span>
                                    <span className={`block truncate text-[10px] ${t.unread ? "font-semibold text-slate-700" : "text-slate-400"}`}>{t.snippet}</span>
                                  </span>
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); toggleStar(t.id); }} className={`shrink-0 pr-2 text-[11px] ${stars[t.id] ? "" : "opacity-30 hover:opacity-70"}`}>{stars[t.id] ? "⭐" : "☆"}</button>
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </span>
                    <span className="block border-t border-slate-100 py-1 text-center text-[8px] font-semibold text-slate-300">tap a conversation to reply · ☆ to star</span>
                  </>
                )}
              </span>
            </span>
          </span>
          <a href="/crm/conversations" className="bg-slate-50 px-3.5 py-2 text-center text-[11px] font-bold text-indigo-700 hover:bg-slate-100">Open Conversations →</a>
        </span>
      )}
    </span>
  );
}
