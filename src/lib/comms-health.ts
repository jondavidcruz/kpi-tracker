// 🛡️ Comms Guardian (Jon 2026-10-21): the CRM's calling, texting, and email can
// NEVER be down. This runs a live battery against Telnyx (voice + SMS) and Resend
// (email), in both directions, writes a timestamped snapshot, and emails Jon the
// moment any lane flips down (and again when it recovers). The /comms-health page
// renders the same battery; a scheduled guardian + the softphone piggyback keep it
// running around the clock.
import { db } from "./db";
import { partitionNumbers, pickWorkingCallerId, type TelnyxNumber } from "./telnyx-numbers";
import { getChannelConfig, sendEmail, alertEmailHtml } from "./notify";

export type Lane = {
  key: string;
  label: string;
  channel: "voice" | "sms" | "email";
  direction: "outbound" | "inbound";
  ok: boolean;
  detail: string;
  fix?: string;
};

export type CommsSnapshot = { at: string; ok: boolean; lanes: Lane[] };

const CAT = "__comms_health__";
const CACHE_MS = 60_000; // don't re-run the live battery more than once a minute

async function telnyxReachable(): Promise<boolean> {
  if (!process.env.TELNYX_API_KEY) return false;
  try {
    const r = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=1", { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    return r.ok;
  } catch { return false; }
}

async function telnyx10dlcActive(): Promise<boolean | null> {
  if (!process.env.TELNYX_API_KEY) return null;
  try {
    const r = await fetch("https://api.telnyx.com/v2/10dlc/campaign?page[size]=20", { headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const b = (await r.json()) as { records?: { status?: string }[]; data?: { status?: string }[] };
    const recs = (b.records ?? b.data ?? []) as { status?: string }[];
    if (recs.length === 0) return false;
    return recs.some((c) => ["ACTIVE", "TCR_ACCEPTED", "APPROVED", "REGISTERED"].includes((c.status ?? "").toUpperCase()));
  } catch { return null; }
}

async function resendVerified(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, detail: "RESEND_API_KEY not set" };
  try {
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { ok: false, detail: `Resend API ${r.status}` };
    const b = (await r.json()) as { data?: { name?: string; status?: string }[] };
    const doms = b.data ?? [];
    const verified = doms.filter((d) => (d.status ?? "").toLowerCase() === "verified");
    if (verified.length === 0) return { ok: false, detail: doms.length ? `${doms.length} domain(s), none verified` : "no sending domain" };
    return { ok: true, detail: `${verified.map((d) => d.name).filter(Boolean).join(", ")} verified` };
  } catch (e) { return { ok: false, detail: `Resend unreachable (${(e as Error).name})` }; }
}

/** Run the full live battery (no caching — callers decide). */
export async function runCommsBattery(): Promise<CommsSnapshot> {
  const at = new Date().toISOString();
  const [reachable, parts, caller, tenDlc, resend, cfg] = await Promise.all([
    telnyxReachable(),
    partitionNumbers(),
    pickWorkingCallerId(process.env.TELNYX_CALLER_ID),
    telnyx10dlcActive(),
    resendVerified(),
    getChannelConfig(),
  ]);
  const live: TelnyxNumber[] = parts.live;
  const smsLines = live.filter((n) => n.msgProfile);
  const voiceConnId = await voiceConnectionId();

  const lanes: Lane[] = [];

  // ── VOICE ──
  lanes.push({
    key: "voice_out", label: "Calling — outbound", channel: "voice", direction: "outbound",
    ok: reachable && caller.active && !!voiceConnId,
    detail: !reachable ? "Telnyx unreachable" : !voiceConnId ? "no War Room voice connection" : caller.active ? `dialing from ${caller.callerId} (${live.length} live line${live.length === 1 ? "" : "s"})` : "no live number to dial from (all porting?)",
    fix: !reachable ? "Check TELNYX_API_KEY in Vercel." : !caller.active ? "Numbers are mid-port — buy/activate one live Telnyx number for the War Room connection." : undefined,
  });
  lanes.push({
    key: "voice_in", label: "Calling — inbound", channel: "voice", direction: "inbound",
    ok: reachable && live.length > 0 && !!voiceConnId,
    detail: !reachable ? "Telnyx unreachable" : live.length === 0 ? "no live number to receive on" : `${live.length} live line${live.length === 1 ? "" : "s"} ringing the War Room`,
    fix: live.length === 0 ? "Porting numbers still ring in GHL — complete the port or activate a live number." : undefined,
  });

  // ── SMS ──
  const smsOut = reachable && smsLines.length > 0;
  lanes.push({
    key: "sms_out", label: "Texting — outbound", channel: "sms", direction: "outbound",
    ok: smsOut,
    detail: !reachable ? "Telnyx unreachable" : smsLines.length === 0 ? "no live number on a messaging profile" : `${smsLines.length} texting line${smsLines.length === 1 ? "" : "s"}${tenDlc === false ? " · ⚠️ 10DLC not active (carriers may filter)" : tenDlc ? " · 10DLC active" : ""}`,
    fix: smsLines.length === 0 ? "Assign a live Telnyx number to a Messaging Profile; porting numbers can't text yet." : tenDlc === false ? "Register/activate A2P 10DLC in Telnyx or texts get filtered." : undefined,
  });
  lanes.push({
    key: "sms_in", label: "Texting — inbound", channel: "sms", direction: "inbound",
    ok: reachable && smsLines.length > 0,
    detail: !reachable ? "Telnyx unreachable" : smsLines.length === 0 ? "no number on a messaging profile to receive on" : `inbound texts land on ${smsLines.length} line${smsLines.length === 1 ? "" : "s"}`,
    fix: smsLines.length === 0 ? "A number needs a Messaging Profile (with the inbound webhook) to receive texts." : undefined,
  });

  // ── EMAIL ──
  lanes.push({
    key: "email_out", label: "Email — outbound", channel: "email", direction: "outbound",
    ok: resend.ok && !!cfg.emailFrom,
    detail: !resend.ok ? resend.detail : !cfg.emailFrom ? "no from-address set" : `sending as ${cfg.emailFrom} · ${resend.detail}`,
    fix: !resend.ok ? "Verify the sending domain in Resend / check RESEND_API_KEY." : !cfg.emailFrom ? "Set the from-address in Settings → Business." : undefined,
  });
  // Inbound email replies route to the team's real Gmail inbox, not through us —
  // healthy as long as a reply-to is configured. Not a Telnyx/Resend dependency.
  lanes.push({
    key: "email_in", label: "Email — inbound (replies)", channel: "email", direction: "inbound",
    ok: true,
    detail: "replies go to the team inbox (Gmail) — not routed through the CRM",
  });

  const ok = lanes.every((l) => l.ok);
  return { at, ok, lanes };
}

async function voiceConnectionId(): Promise<string> {
  try {
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    const cfg = (row?.description ? JSON.parse(row.description) : {}) as { connId?: string };
    return cfg.connId ?? "";
  } catch { return ""; }
}

type Stored = { at: string; ok: boolean; lanes: Lane[]; history?: { at: string; ok: boolean; down: string[] }[] };

/** Read the last stored snapshot (what the dashboard shows between live runs). */
export async function lastSnapshot(): Promise<Stored | null> {
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    return row?.description ? (JSON.parse(row.description) as Stored) : null;
  } catch { return null; }
}

/** Run the battery, persist it, and email Jon on any lane that flipped down or back
 *  up since the last run. Returns the fresh snapshot. `force` skips the 1-min cache. */
export async function checkAndRecordComms(force = false): Promise<Stored> {
  const prev = await lastSnapshot();
  if (!force && prev && Date.now() - Date.parse(prev.at) < CACHE_MS) return prev;

  const snap = await runCommsBattery();
  const prevOk = new Map((prev?.lanes ?? []).map((l) => [l.key, l.ok]));
  const newlyDown = snap.lanes.filter((l) => !l.ok && prevOk.get(l.key) !== false);
  const recovered = snap.lanes.filter((l) => l.ok && prevOk.get(l.key) === false);

  const history = [{ at: snap.at, ok: snap.ok, down: snap.lanes.filter((l) => !l.ok).map((l) => l.key) }, ...(prev?.history ?? [])].slice(0, 60);
  const stored: Stored = { ...snap, history };
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    const description = JSON.stringify(stored);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "comms-health", category: CAT, url: "", description } });
  } catch { /* non-blocking */ }

  // Alert ONLY on state change, by email (keeps the KPI chat space clean).
  if (newlyDown.length || recovered.length) {
    try {
      if (newlyDown.length) {
        const lines = newlyDown.map((l) => `🔴 ${l.label}: ${l.detail}${l.fix ? ` — FIX: ${l.fix}` : ""}`);
        await sendEmail(`🚨 War Room comms DOWN: ${newlyDown.map((l) => l.label).join(", ")}`, alertEmailHtml("Comms line went down", [...lines, "", "Open /comms-health in the War Room for the full board."]));
      }
      if (recovered.length) {
        await sendEmail(`✅ War Room comms recovered: ${recovered.map((l) => l.label).join(", ")}`, alertEmailHtml("Comms line recovered", recovered.map((l) => `✅ ${l.label}: ${l.detail}`)));
      }
    } catch { /* alerting is best-effort */ }
  }
  return stored;
}
