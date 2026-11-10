"use client";
// iPhone-style SMS composer (Jon 2026-10-07): type on the left, see EXACTLY
// how it lands on the seller's phone on the right — live green-bubble
// preview, segment counter, and a "send from" picker over our Telnyx lines.
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendCrmSmsAction, logIphoneTextAction } from "@/app/crm/actions";
import { geoForPhone } from "@/lib/npa-geo";
import { GOOGLE_REVIEW_LINK } from "@/lib/crm-shared";

type Snip = { id: string; name: string; kind: string; subject?: string; body: string };

function fmt(n: string) {
  const d = n.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n;
}

type HistMsg = { body: string; inbound: boolean; at: string };

export default function SmsComposer({ oppId, contactId, to, leadName, rep, snippets, compact = false, history = [] }: {
  oppId: string; contactId: string; to: string; leadName: string; rep: string; snippets: Snip[]; compact?: boolean; history?: HistMsg[];
}) {
  const allSnips: Snip[] = [
    { id: "__review", name: "⭐ Ask for Google review", kind: "sms", body: `Hi {name}, it was a pleasure working with you! Would you mind leaving us a quick Google review? Takes 30 seconds: ${GOOGLE_REVIEW_LINK} — thank you! — {rep} @ Freedom Offers` },
    ...snippets,
  ];
  const [text, setText] = useState("");
  const [from, setFrom] = useState("");
  // 📱 Editable recipient (Jon 2026-10-27: a bad/partial number in the phone field was texting
  // the wrong place). Pre-filled from the contact; fix or paste the right one here.
  const [toNum, setToNum] = useState(to);
  useEffect(() => { setToNum(to); }, [to]);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [isOwner, setIsOwner] = useState(false); // 📱 owner-only "Send from my iPhone" (Jon 2026-11-10)
  // 📷 MMS attachment (Jon 2026-10-12) — compressed in the browser so it
  // always fits carrier limits (max 1280px, jpeg q0.8, ~<500KB)
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pickPhoto = async (f: File) => {
    try {
      const bmp = await createImageBitmap(f);
      const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
      canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.8));
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch { /* unsupported file — ignore */ }
  };
  const [sent, setSent] = useState("");
  const [confirming, setConfirming] = useState(false);
  // ⏳ Undo-send window (Jon 2026-11-05): a 15s hold with an Undo button so a typo or
  // wrong recipient can be caught before the text actually goes out.
  const SEND_DELAY = 15;
  const [countdown, setCountdown] = useState<number | null>(null);
  const sendTimer = useRef<ReturnType<typeof setInterval> | null>(null); // visual countdown ONLY
  const sendTimeout = useRef<ReturnType<typeof setTimeout> | null>(null); // the single real send
  const firedRef = useRef(false); // guarantees fireSend runs at most once per countdown
  const clearSendTimers = () => {
    if (sendTimer.current) { clearInterval(sendTimer.current); sendTimer.current = null; }
    if (sendTimeout.current) { clearTimeout(sendTimeout.current); sendTimeout.current = null; }
  };
  useEffect(() => () => clearSendTimers(), []);
  // 🟢 optimistic just-sent texts — cleared when the server sends a fresh (larger) history.
  const [localMsgs, setLocalMsgs] = useState<HistMsg[]>([]);
  useEffect(() => { setLocalMsgs([]); }, [history.length]);
  const [pending, start] = useTransition();
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [text, history.length]);
  const router = useRouter();
  const first = leadName.split(" ")[0] || "there";

  useEffect(() => {
    fetch("/api/crm/phone").then(async (r) => {
      if (!r.ok) return;
      const j = (await r.json()) as { numbers?: string[]; isOwner?: boolean };
      if (j.numbers?.length) { setNumbers(j.numbers); }
      if (j.isOwner) setIsOwner(true);
    }).catch(() => {});
  }, []);

  // GSM-ish segmenting: 160 fits one text; longer messages split at 153.
  const len = text.length;
  const segs = len === 0 ? 0 : len <= 160 ? 1 : Math.ceil(len / 153);

  // The real send — fires EXACTLY ONCE after the undo window elapses.
  const fireSend = () => {
    if (firedRef.current) return; // 🛑 never send twice for one countdown
    firedRef.current = true;
    clearSendTimers();
    setCountdown(null);
    const fd = new FormData();
    fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("to", toNum); fd.set("text", text);
    if (from) fd.set("from", from);
    if (photo) fd.set("photo", photo.blob, "photo.jpg");
    const sentText = text;
    start(async () => {
      await sendCrmSmsAction(fd);
      // 🟢 Show the sent text in the thread INSTANTLY (Jon 2026-10-29: "it didn't update in
      // real time, only on refresh") — reconciles with the server copy on the next refetch.
      setLocalMsgs((p) => [...p, { body: sentText, inbound: false, at: new Date().toISOString() }]);
      setText(""); setPhoto(null); setSent("✓ Sent"); setTimeout(() => setSent(""), 2500); router.refresh();
    });
  };
  const undoSend = () => { clearSendTimers(); firedRef.current = false; setCountdown(null); };
  // 📱 Owner-only: open Messages on Jon's own iPhone/Mac pre-filled (real blue iMessage, which
  // bypasses carrier 10DLC filtering), then LOG it to the thread so history stays complete. No
  // Telnyx send. The "📱 " marker makes it show as a blue bubble in the preview + thread.
  const telE164 = "+1" + toNum.replace(/\D/g, "").slice(-10);
  const iphoneHref = text.trim() ? `sms:${telE164}&body=${encodeURIComponent(text.trim())}` : undefined;
  const sendFromIphone = () => {
    const body = text.trim(); if (!body) return;
    const fd = new FormData();
    fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("to", toNum); fd.set("text", body);
    start(async () => {
      await logIphoneTextAction(fd);
      setLocalMsgs((p) => [...p, { body: `📱 ${body}`, inbound: false, at: new Date().toISOString() }]);
      setText(""); setSent("📱 Sent from iPhone (logged here)"); setTimeout(() => setSent(""), 2800); router.refresh();
    });
  };
  const send = () => {
    if (!text.trim() && !photo) return;
    if (countdown !== null) return; // a countdown is already running — ignore extra clicks
    // FIRST text to this seller ever → one explicit confirmation (Jon
    // 2026-10-07: "if it's a new text we definitely want that final check");
    // quick replies in an existing thread go straight out.
    if (history.length === 0 && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    // ⏳ Start the 15s undo window. The interval is DISPLAY ONLY (a pure state updater, no
    // side effects); the actual send is a SINGLE setTimeout guarded by firedRef, so the
    // composer can never fire more than one text per countdown (Jon 2026-11-05).
    firedRef.current = false;
    setCountdown(SEND_DELAY);
    sendTimer.current = setInterval(() => setCountdown((c) => (c === null || c <= 1 ? c : c - 1)), 1000);
    sendTimeout.current = setTimeout(fireSend, SEND_DELAY * 1000);
  };

  return (
    <div className="flex items-start gap-3">
      {/* compose side */}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">💬 Text message</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <span className="font-bold">From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold">
            <option value="">Default line</option>
            {numbers.map((n) => { const g = geoForPhone(n); return <option key={n} value={n}>{fmt(n)}{g ? ` — ${g}` : ""}</option>; })}
          </select>
          <span className="font-bold">→ To</span>
          <input value={toNum} onChange={(e) => setToNum(e.target.value)} placeholder="recipient #" title="The number we'll text — edit if it's wrong or incomplete" className={`w-28 rounded border bg-white px-1.5 py-0.5 text-[11px] font-semibold ${toNum.replace(/\D/g, "").slice(-10).length === 10 && /[2-9]/.test(toNum.replace(/\D/g, "").slice(-10)[0]) ? "border-slate-200 text-slate-700" : "border-red-300 bg-red-50 text-red-700"}`} />
          <span className="text-[10px] text-slate-400">{geoForPhone(toNum) ?? ""}</span>
        </div>
        <textarea
          value={text} onChange={(e) => setText(e.target.value)} rows={compact ? 3 : 5}
          placeholder={`Text ${first}…`}
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        {photo && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.preview} alt="attachment" className="h-14 w-14 rounded-lg object-cover ring-1 ring-slate-200" />
            <button onClick={() => setPhoto(null)} className="text-[10px] font-bold text-red-500 hover:text-red-700">✕ remove photo</button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickPhoto(f); e.target.value = ""; }} />
          <button onClick={() => photoInputRef.current?.click()} title="Attach a photo (MMS)" className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] hover:bg-slate-50">📷</button>
          {allSnips.length > 0 && (
            <select defaultValue="" onChange={(e) => { const s = allSnips.find((x) => x.id === e.target.value); if (s) setText(s.body.replaceAll("{name}", first).replaceAll("{rep}", rep.split(" ")[0] || "us")); e.target.value = ""; }} className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-500">
              <option value="">📋 snippet…</option>
              {allSnips.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <span className={`text-[10px] font-bold ${segs > 1 ? "text-amber-600" : "text-slate-400"}`}>{len} chars · {segs || "—"} text{segs === 1 ? "" : "s"}{segs > 1 ? " (they'll see it stitched together)" : ""}</span>
          {sent && <span className="text-[11px] font-bold text-emerald-600">{sent}</span>}
          {isOwner && countdown === null && !confirming && (
            iphoneHref
              ? <a href={iphoneHref} onClick={sendFromIphone} title="Opens Messages on your iPhone/Mac pre-filled with this text — you tap send (blue iMessage if they're on Apple), and it's logged here. Bypasses the 10DLC carrier blocks. Owner-only." className="ml-auto rounded-lg bg-[#1a7cff] px-3 py-1.5 text-xs font-extrabold text-white shadow-sm hover:brightness-110">📱 From my iPhone</a>
              : <span className="ml-auto rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-300">📱 From my iPhone</span>
          )}
          {countdown !== null ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="text-[11px] font-bold text-amber-700">Sending in {countdown}s…</span>
              <button onClick={undoSend} className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-extrabold text-white shadow-sm hover:bg-amber-600">↩ Undo</button>
            </span>
          ) : confirming ? (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-amber-700">First text to {first} — send it?</span>
              <button onClick={send} disabled={pending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">✓ Yes, send text</button>
              <button onClick={() => setConfirming(false)} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
            </span>
          ) : (
            <button onClick={send} disabled={pending || !text.trim()} className="ml-auto rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-40">{pending ? "Sending…" : "Send SMS"}</button>
          )}
        </div>
      </div>

      {/* their phone, live */}
      <div className={`hidden shrink-0 select-none md:block ${compact ? "w-[210px]" : "w-[230px]"}`}>
        <div className="rounded-[2.4rem] bg-slate-900 p-2 shadow-xl">
          <div className="overflow-hidden rounded-[1.9rem] bg-white">
            <div className="flex items-center justify-between px-5 pt-2 text-[9px] font-bold text-slate-900"><span>9:41</span><span>📶 🔋</span></div>
            <div className="border-b border-slate-100 pb-2 pt-1 text-center">
              <div className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-slate-300 text-[11px] font-bold text-white">{(leadName[0] ?? "?").toUpperCase()}</div>
              <div className="mt-0.5 text-[10px] font-semibold text-slate-800">{first} 〉</div>
            </div>
            <div ref={threadRef} className={`flex flex-col gap-1 overflow-y-auto bg-white px-2.5 pb-2 pt-1 ${compact ? "h-[230px]" : "h-[260px]"}`}>
              <div className="mt-auto" />
              <div className="text-center text-[8px] font-semibold text-slate-400">Text Message · SMS{history.length ? "" : " · Today"}</div>
              {[...history, ...localMsgs].map((m, i) => {
                // 📱 iPhone/iMessage sends (body marked with 📱) render BLUE; Telnyx SMS stays green;
                // inbound stays gray — so Jon can tell at a glance what went out as blue iMessage.
                const iph = !m.inbound && m.body.startsWith("📱");
                const bg = m.inbound ? "#e9e9eb" : iph ? "#1a7cff" : "#34c759";
                return (
                  <div key={i} className={`flex ${m.inbound ? "justify-start" : "justify-end"}`}>
                    <div className="max-w-[80%] whitespace-pre-line break-words rounded-2xl px-2.5 py-1.5 text-[11px] leading-snug" style={{ backgroundColor: bg, color: m.inbound ? "#111" : "#fff", ...(m.inbound ? { borderBottomLeftRadius: 4 } : { borderBottomRightRadius: 4 }) }}>{m.body}</div>
                  </div>
                );
              })}
              <div className="flex justify-end" style={{ display: text ? "flex" : "none" }}>
                <div className="max-w-[80%] whitespace-pre-line break-words rounded-2xl rounded-br-[4px] px-2.5 py-1.5 text-[11px] leading-snug" style={{ backgroundColor: "#34c759", color: "#fff" }}>{text}</div>
              </div>
              <div className="pr-1 text-right text-[8px] font-semibold text-slate-400" style={{ display: text ? "block" : "none" }}>Delivered</div>
              {!text && history.length === 0 && <div className="pb-2 text-center text-[9px] text-slate-300">start typing to preview…</div>}
            </div>
            <div className="flex items-center gap-1.5 border-t border-slate-100 px-2.5 py-1.5">
              <div className="h-5 flex-1 rounded-full bg-slate-100" />
              <div className="grid h-5 w-5 place-items-center rounded-full text-[9px]" style={{ backgroundColor: "#34c759", color: "#fff" }}>↑</div>
            </div>
          </div>
        </div>
        <div className="mt-1 text-center text-[9px] text-slate-400">how it looks on {first}&apos;s phone</div>
      </div>
    </div>
  );
}
