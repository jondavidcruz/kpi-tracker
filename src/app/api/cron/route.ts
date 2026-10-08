import { NextResponse } from "next/server";
import { runScheduledChecks, sendShiftStartSpeedReminders, sendPostLunchSpeedReminders } from "@/lib/alerts";
import { SPEED_CHECKS_CATEGORY } from "@/lib/speed-checks";
import { rollupResearchKpis } from "@/lib/research-kpis";
import { getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { db } from "@/lib/db";
import { buildBackup } from "@/lib/backup";
import { sendEmailWithAttachment, sendTeamChat, sendEmailTo, sendTimecardChat, postChatWebhook } from "@/lib/notify";
import { upcomingCulture, prettyMMDD, whenLabel, ordinal } from "@/lib/culture";
import { isSemiMonthlyPayday } from "@/lib/date";
import { sendPayrollEmail } from "@/lib/payday";
import { sendCallCoverageChat } from "@/lib/call-coverage";
import { autoCloseAbandonedSessions } from "@/lib/timeclock";
import { sendHuddleBrief, sendHuddleNudge } from "@/lib/huddle-brief";
import { writeDay, writeOpps, writeActivity } from "@/lib/crm-sync";
import { migrateRecordingsToDrive } from "@/lib/recording-migrate";
import { sendLeaksReport } from "@/lib/diagnostics";
import { sendBuyerBoxReport } from "@/lib/buyer-report";

// Current America/Los_Angeles hour (0–23) + weekday (0=Sun…6=Sat), DST-safe.
function laNow(): { hour: number; dow: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dow = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  return { hour, dow };
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled alert check. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`. For manual runs you can pass
 * `?secret=$CRON_SECRET` and optionally `?date=YYYY-MM-DD&force=1`.
 */
export async function POST(request: Request) { return GET(request); }

export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const auth = request.headers.get("authorization");
    const fromHeader = auth === `Bearer ${secret}`;
    const fromQuery = url.searchParams.get("secret") === secret;
    if (!fromHeader && !fromQuery) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const date = url.searchParams.get("date") ?? undefined;
  const force = url.searchParams.get("force") === "1";
  const weekly = url.searchParams.get("weekly") === "1";
  const review = url.searchParams.get("review") === "1";

  // One-shot dispo scorecard cleanup (Jon 2026-10-01): hide Flipper Conversations
  // + Deals Comped (deactivate — history kept), rename Developer Conversations →
  // Buyer Conversations (one KPI for all buyer types: developers + flippers).
  if (url.searchParams.get("dispokpis") === "1") {
    const hidFlipper = await db.kpi.updateMany({ where: { key: "buyer_conversations" }, data: { active: false } });
    const hidComped = await db.kpi.updateMany({ where: { key: "deals_comped" }, data: { active: false } });
    const renamed = await db.kpi.updateMany({
      where: { key: "dev_conversations" },
      data: { name: "Buyer Conversations", definition: "Real conversations with buyers of any type — developers, builders, fix & flippers (call ≥1 min or substantive back-and-forth)." },
    });
    const after = await db.kpi.findMany({ where: { key: { in: ["buyer_conversations", "deals_comped", "dev_conversations"] } }, select: { key: true, name: true, active: true } });
    return NextResponse.json({ ok: true, hidFlipper: hidFlipper.count, hidComped: hidComped.count, renamed: renamed.count, after });
  }

  // CRM mapping diagnostic — who exists in REI Reply and whose userIds actually
  // appear on recent TYPE_CALL messages (bounded scan, ~30 conversations). Built
  // to answer why Sharyn's talk time doesn't auto-feed while Marie's does.
  if (url.searchParams.get("crmdiag") === "1") {
    const { listCrmUsers, searchConversations, getMessages } = await import("@/lib/reireply");
    const users = await listCrmUsers();
    const conv = await searchConversations({ limit: "30" });
    const callsByUser: Record<string, { calls: number; talkSec: number; lastCall: string }> = {};
    let msgScanned = 0;
    if (conv.ok) {
      const convs = (conv.body as { conversations?: Array<{ id: string }> }).conversations ?? [];
      for (const c of convs) {
        const m = await getMessages(c.id);
        if (!m.ok) continue;
        const mb = m.body as { messages?: unknown[] | { messages?: unknown[] } };
        const list: unknown[] = Array.isArray(mb?.messages) ? (mb.messages as unknown[]) : ((mb?.messages as { messages?: unknown[] })?.messages ?? []);
        for (const raw of list) {
          const msg = raw as { dateAdded?: string; userId?: string; messageType?: string; meta?: { call?: { duration?: number } } };
          msgScanned++;
          if (msg.messageType !== "TYPE_CALL") continue;
          const uid = String(msg.userId ?? "(none)");
          const e = (callsByUser[uid] ??= { calls: 0, talkSec: 0, lastCall: "" });
          e.calls++;
          e.talkSec += Number(msg.meta?.call?.duration ?? 0) || 0;
          const dt = String(msg.dateAdded ?? "");
          if (dt > e.lastCall) e.lastCall = dt;
        }
      }
    }
    return NextResponse.json({ ok: true, crmUsers: users.users, msgScanned, callsByUser });
  }

  // Live key check — proves each newly-added API key actually works (never
  // echoes a key). Run after adding env vars + redeploying.
  if (url.searchParams.get("keycheck") === "1") {
    const out: Record<string, { set: boolean; works?: boolean; detail?: string }> = {};
    out.REGRID_API_KEY = { set: !!process.env.REGRID_API_KEY };
    if (out.REGRID_API_KEY.set) {
      try {
        const { parcelByApn } = await import("@/lib/geo/parcels");
        const pc = await parcelByApn("402116252014", "FL", "Charlotte"); // Port Charlotte sample APN
        out.REGRID_API_KEY.works = !!pc;
        out.REGRID_API_KEY.detail = pc ? `${pc.address || "parcel found"} · ${pc.acres ?? "?"} ac · zone ${pc.zoning || "?"}` : "key accepted but APN lookup empty — check plan includes API";
      } catch (e) { out.REGRID_API_KEY.works = false; out.REGRID_API_KEY.detail = String(e).slice(0, 320); }
    }
    out.GOOGLE_MAPS_API_KEY = { set: !!process.env.GOOGLE_MAPS_API_KEY };
    if (out.GOOGLE_MAPS_API_KEY.set) {
      try {
        const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=Murfreesboro%2C+TN&key=${process.env.GOOGLE_MAPS_API_KEY}`, { cache: "no-store" });
        const j = (await r.json()) as { status?: string; error_message?: string };
        out.GOOGLE_MAPS_API_KEY.works = j.status === "OK";
        out.GOOGLE_MAPS_API_KEY.detail = j.status === "OK" ? "geocoding OK" : `${j.status}: ${j.error_message ?? ""}`.slice(0, 140);
      } catch (e) { out.GOOGLE_MAPS_API_KEY.works = false; out.GOOGLE_MAPS_API_KEY.detail = String(e).slice(0, 120); }
    }
    out.RENTCAST_API_KEY = { set: !!process.env.RENTCAST_API_KEY };
    if (out.RENTCAST_API_KEY.set) {
      try {
        const { rentcastValue, rentcastUsage } = await import("@/lib/rentcast");
        const est = await rentcastValue("2118 Old Fort Pkwy, Murfreesboro, TN 37129", "keycheck");
        const u = await rentcastUsage();
        out.RENTCAST_API_KEY.works = est.value != null || est.comps.length > 0;
        out.RENTCAST_API_KEY.detail = `value $${est.value?.toLocaleString() ?? "?"} · ${est.comps.length} comps · usage ${u.used}/${u.cap} this month`;
      } catch (e) { out.RENTCAST_API_KEY.works = false; out.RENTCAST_API_KEY.detail = String(e).slice(0, 200); }
    }
    out.REIAI_API_KEY = { set: !!process.env.REIAI_API_KEY, detail: process.env.REIAI_API_KEY ? "key saved — waiting on their API docs to wire comps" : undefined };
    out.DEALMACHINE_API_KEY = { set: !!process.env.DEALMACHINE_API_KEY };
    if (out.DEALMACHINE_API_KEY.set) {
      try {
        const r = await fetch("https://api.dealmachine.com/public/v1/leads/?limit=1", { headers: { Authorization: `Bearer ${process.env.DEALMACHINE_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
        const j = (await r.json().catch(() => ({}))) as { data?: unknown[]; total?: number; error?: unknown };
        out.DEALMACHINE_API_KEY.works = r.ok;
        out.DEALMACHINE_API_KEY.detail = r.ok ? `connected · ${Array.isArray(j.data) ? `${j.total ?? j.data.length}+ leads visible` : "ok"}` : `status ${r.status}: ${JSON.stringify(j).slice(0, 120)}`;
      } catch (e) { out.DEALMACHINE_API_KEY.works = false; out.DEALMACHINE_API_KEY.detail = String(e).slice(0, 120); }
    }
    out.DIRECTREI_API_KEY = { set: !!process.env.DIRECTREI_API_KEY };
    // Env-name discovery (names ONLY, never values) — finds what Jon called a
    // freshly added key, e.g. the REI AI one.
    (out as Record<string, unknown>).envNamesMatchingREI = Object.keys(process.env).filter((k) => /REI|RENTCAST|REGRID|TWILIO|TELNYX|DEALMACHINE|MAPS|GEMINI|ANTHROPIC/i.test(k)).sort();
    // Phone providers (feed /phone-health + /compliance): live round-trips.
    try {
      const { telcoEnvStatus, twilioHealth, telnyxHealth } = await import("@/lib/telco");
      const env = telcoEnvStatus();
      out.TWILIO = { set: env.twilioSid && env.twilioToken };
      if (out.TWILIO.set) { const h = await twilioHealth(); out.TWILIO.works = h.connected; out.TWILIO.detail = h.connected ? `${h.numbers ?? 0} numbers · ${h.issues.length ? h.issues.length + " issues" : "healthy"}` : (h.reason ?? "").slice(0, 140); }
      out.TELNYX = { set: env.telnyx };
      if (out.TELNYX.set) { const h = await telnyxHealth(); out.TELNYX.works = h.connected; out.TELNYX.detail = h.connected ? `${h.numbers ?? 0} numbers · ${h.issues.length ? h.issues.length + " issues" : "healthy"}` : (h.reason ?? "").slice(0, 140); }
    } catch (e) { (out as Record<string, unknown>).telcoError = String(e).slice(0, 120); }
    if (out.DIRECTREI_API_KEY.set) {
      const { directReiWhoami } = await import("@/lib/directrei");
      const r = await directReiWhoami();
      out.DIRECTREI_API_KEY.works = r.ok;
      out.DIRECTREI_API_KEY.detail = r.ok ? `connected: ${JSON.stringify(r.body).slice(0, 120)}` : `status ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}`;
    }
    return NextResponse.json({ ok: true, keys: out });
  }

  // Direct REI shape probe — object KEYS + counts only (no contact PII), so we
  // can build the real sync against their actual response format.
  if (url.searchParams.get("dreidiag") === "1") {
    const { directReiConfigured, directReiWhoami, directReiContacts, directReiCampaigns, directReiDeals } = await import("@/lib/directrei");
    if (!directReiConfigured()) return NextResponse.json({ ok: false, hint: "DIRECTREI_API_KEY not set in Vercel yet" });
    const shape = (v: unknown): unknown => {
      if (Array.isArray(v)) return { array: v.length, itemKeys: v[0] && typeof v[0] === "object" ? Object.keys(v[0] as object) : typeof v[0] };
      if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, Array.isArray(x) ? `array(${x.length})${x[0] && typeof x[0] === "object" ? ":" + Object.keys(x[0] as object).join(",") : ""}` : typeof x]));
      return typeof v;
    };
    const [me2, contacts, campaigns, dealsR] = await Promise.all([directReiWhoami(), directReiContacts({ limit: "200" }), directReiCampaigns(), directReiDeals()]);
    if (url.searchParams.get("deep") === "1") {
      // Classification probe: campaign names/channels + distinct contact status
      // values + reply-field coverage. No names/emails/phones returned.
      const camps = ((campaigns.body as { rows?: Array<{ id: string; name: string; channel: string; paused: boolean }> })?.rows ?? []);
      const rows = ((contacts.body as { rows?: Array<Record<string, unknown>> })?.rows ?? []);
      const statuses: Record<string, number> = {};
      const types: Record<string, number> = {};
      let withReply = 0, optedOut = 0;
      const byCampaign: Record<string, { contacts: number; replied: number }> = {};
      for (const c of rows) {
        statuses[String(c.status ?? "")] = (statuses[String(c.status ?? "")] ?? 0) + 1;
        types[String(c.contact_type ?? "")] = (types[String(c.contact_type ?? "")] ?? 0) + 1;
        if (c.last_reply_at) withReply++;
        if (c.sms_opted_out_at || c.email_opted_out_at) optedOut++;
        const cid = String(c.campaign_id ?? "");
        const e = (byCampaign[cid] ??= { contacts: 0, replied: 0 });
        e.contacts++; if (c.last_reply_at) e.replied++;
      }
      return NextResponse.json({
        ok: true,
        campaigns: camps.map((c) => ({ name: c.name, channel: c.channel, paused: c.paused, seller: /seller/i.test(c.name), buyer: /buyer/i.test(c.name), ...byCampaign[c.id] })),
        contactSample: { count: rows.length, statuses, types, withReply, optedOut },
        contactFieldSample: rows[0] ? Object.fromEntries(Object.entries(rows[0]).filter(([k]) => ["status", "contact_type", "role", "needs_attention", "last_reply_at", "last_sent", "emails_sent", "added_date", "source", "market"].includes(k)) ) : null,
      });
    }
    return NextResponse.json({ ok: true, me: { status: me2.status, body: me2.ok ? me2.body : shape(me2.body) }, contacts: { status: contacts.status, shape: shape(contacts.body) }, campaigns: { status: campaigns.status, shape: shape(campaigns.body) }, deals: { status: dealsR.status, shape: shape(dealsR.body) } });
  }

  // One-shot glance cleanup (Jon 2026-10-04): refunds trio joins PPL Leads on
  // row one, Text Responses heads its own row, Land Offers/Contracts retire
  // (the offer trail lives in the per-rep rollups now).
  if (url.searchParams.get("glancefix") === "1") {
    const order = [
      "PPL Leads (Purchased/Inbound)", "Lead Refunds Requested", "Lead Refunds Approved", "Lead Refunds Rejected",
      "Text Responses", "Mailers Sent", "Mail Responses", "SMS Conversations (Land)",
    ];
    const results: Record<string, string> = {};
    for (let i = 0; i < order.length; i++) {
      const r = await db.kpi.updateMany({ where: { name: order[i], scope: "team" }, data: { sortOrder: 10 + i } });
      results[order[i]] = r.count ? `sortOrder ${10 + i}` : "NOT FOUND";
    }
    for (const key of ["land_offers_made", "land_contracts_signed"]) {
      const r = await db.kpi.updateMany({ where: { key }, data: { active: false } });
      results[key] = r.count ? "deactivated" : "NOT FOUND";
    }
    const textKpi = await db.kpi.findFirst({ where: { name: "Text Responses", scope: "team" }, select: { key: true, id: true } });
    return NextResponse.json({ ok: true, results, textResponsesKey: textKpi?.key ?? null });
  }

  // Glance round 2 (Jon 2026-10-04): land SMS KPI retired; Text Responses
  // splits into Seller/Buyer SMS replies, both machine-fed from Direct REI.
  if (url.searchParams.get("glancefix2") === "1") {
    const results: Record<string, string> = {};
    const r1 = await db.kpi.updateMany({ where: { key: "land_sms_convos" }, data: { active: false } });
    results.land_sms_convos = r1.count ? "deactivated" : "NOT FOUND";
    const r2 = await db.kpi.updateMany({ where: { key: "text_responses" }, data: { name: "Seller SMS Replies", emoji: "💬", sortOrder: 14, definition: "Auto-counted: replies to Direct REI SELLER text campaigns today (opt-outs excluded)." } });
    results.text_responses = r2.count ? "renamed Seller SMS Replies" : "NOT FOUND";
    const existing = await db.kpi.findUnique({ where: { key: "buyer_sms_replies" } });
    if (!existing) {
      await db.kpi.create({ data: { key: "buyer_sms_replies", name: "Buyer SMS Replies", emoji: "💬", category: "blue", unit: "count", scope: "team", roleKey: "", cadence: "daily", goalKind: "tracked", sortOrder: 15, definition: "Auto-counted: replies to Direct REI BUYER text campaigns today (opt-outs excluded)." } });
      results.buyer_sms_replies = "created";
    } else results.buyer_sms_replies = "already exists";
    await db.kpi.updateMany({ where: { name: "Mailers Sent", scope: "team" }, data: { sortOrder: 16 } });
    await db.kpi.updateMany({ where: { name: "Mail Responses", scope: "team" }, data: { sortOrder: 17 } });
    return NextResponse.json({ ok: true, results });
  }

  // Retire the Developer Outreach KPI (Jon 2026-10-06: redundant — Direct REI
  // runs the outreach now; research touches keep logging underneath).
  if (url.searchParams.get("dispokpis2") === "1") {
    const r = await db.kpi.updateMany({ where: { key: "developers_contacted" }, data: { active: false } });
    return NextResponse.json({ ok: true, developers_contacted: r.count ? "deactivated" : "NOT FOUND" });
  }

  // Direct REI phone-endpoint probe: does their API expose numbers/calls at all?
  if (url.searchParams.get("dreiphones") === "1") {
    const { directReiConfigured } = await import("@/lib/directrei");
    if (!directReiConfigured()) return NextResponse.json({ ok: false, hint: "key not set" });
    const BASE = process.env.DIRECTREI_API_BASE || "https://vrgnjfatqasljgzrhyub.supabase.co/functions/v1/api/v1";
    const probe = async (path: string) => {
      try {
        const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${process.env.DIRECTREI_API_KEY}` }, cache: "no-store", signal: AbortSignal.timeout(12000) });
        return { path, status: r.status, keys: r.ok ? Object.keys((await r.json().catch(() => ({}))) as object).slice(0, 10) : undefined };
      } catch (e) { return { path, status: 0, err: String(e).slice(0, 60) }; }
    };
    const results = await Promise.all(["/numbers", "/phone_numbers", "/phones", "/calls", "/call_logs", "/messages", "/health/phones"].map(probe));
    return NextResponse.json({ ok: true, results });
  }

  // One-time import of the dispo follow-up Excel (Agents & Buyers + Developer
  // Lead Feedback sheets, parsed 2026-10-06). Dry-run by default; &commit=1
  // writes. Dedupes against existing buyers by email → phone → name.
  if (url.searchParams.get("dispoexcel") === "1") {
    const commit = url.searchParams.get("commit") === "1";
    const data = (await import("@/lib/dispo-excel-import.json")).default as {
      contacts: Array<{ name: string; phone: string; email: string; status: string; feedback: string; followupStatus: string; results: string; rep: string; date: string }>;
      feedback: Array<{ seller: string; address: string; ask: string; developer: string; feedback: string }>;
    };
    const existing = await db.marketContact.findMany({ select: { id: true, name: true, email: true, phone: true } });
    const digits = (x: string) => x.replace(/\D/g, "");
    const norm = (x: string) => x.trim().toLowerCase();
    const byEmail = new Map(existing.filter((e) => e.email).map((e) => [norm(e.email), e]));
    const byPhone = new Map(existing.filter((e) => digits(e.phone).length >= 10) .map((e) => [digits(e.phone).slice(-10), e]));
    const byName = new Map(existing.map((e) => [norm(e.name), e]));
    const typeMap: Record<string, string> = { Developer: "developer", Agent: "agent", "JV Partner": "jv_partner" };
    const isIntent = (t: string) => /no answer|call |call$|follow|tomorrow|monday|thursday|sleeping/i.test(t);
    const report = { created: [] as string[], matched: [] as string[], touches: 0, dealSends: 0, skipped: [] as string[] };
    for (const c of data.contacts) {
      if (!c.name || !typeMap[c.status]) { if (c.name) report.skipped.push(`${c.name} (status "${c.status}")`); continue; }
      const match = (c.email && byEmail.get(norm(c.email))) || (digits(c.phone).length >= 10 && byPhone.get(digits(c.phone).slice(-10))) || byName.get(norm(c.name));
      const intent = isIntent(c.followupStatus);
      const nextFollowUp = intent ? new Date(Date.parse((c.date || new Date().toISOString().slice(0, 10)) + "T12:00:00Z") + 3 * 86400000).toISOString().slice(0, 10) : "";
      const notes = [c.feedback, intent ? `follow-up: ${c.followupStatus}` : "", c.results].filter(Boolean).join(" · ");
      if (match) {
        report.matched.push(c.name);
        if (commit) {
          const { updateBuyer, logTouch } = await import("@/lib/buyers/write");
          await updateBuyer(match.id, { ...(nextFollowUp ? { nextFollowUp } : {}), lastContacted: c.date || undefined }, c.rep || "excel-import", { action: "excel_import" });
          if (notes) { await logTouch(match.id, { channel: "call", note: notes.slice(0, 300) }, c.rep || "excel-import"); report.touches++; }
        }
      } else {
        report.created.push(`${c.name} (${typeMap[c.status]})`);
        if (commit) {
          const row = await db.marketContact.create({ data: {
            name: c.name, phone: c.phone, email: c.email, type: typeMap[c.status],
            vetStage: "vetted", vetStatus: c.followupStatus && !intent ? "" : "contacted",
            market: !intent && c.followupStatus ? c.followupStatus.slice(0, 80) : "",
            lastContacted: c.date || "", nextFollowUp, outreachLog: notes ? `${c.date || ""}: ${notes}`.slice(0, 1000) : "",
          } });
          if (notes) { const { logTouch } = await import("@/lib/buyers/write"); await logTouch(row.id, { channel: "call", note: notes.slice(0, 300) }, c.rep || "excel-import"); report.touches++; }
        }
      }
    }
    // Developer deal feedback → touches + a DealSend per LAND deal each
    // developer was sent (Jon 2026-10-06: the girls must see which developer
    // got which deal). Historical deals missing from the board are created as
    // archived (dead + inactive) anchor rows — invisible everywhere except as
    // the deal the send points at.
    const buyers2 = await db.marketContact.findMany({ select: { id: true, name: true } });
    const byName2 = new Map(buyers2.map((b) => [norm(b.name), b]));
    const deals = await db.deal.findMany({ select: { id: true, address: true, contractPrice: true } });
    // tiny edit-distance so "Adam Homes" still finds "Adams Homes"
    const lev1 = (a: string, b: string) => {
      if (a === b) return true;
      if (Math.abs(a.length - b.length) > 1) return false;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        if (a[i] !== b[i]) return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
      }
      return true;
    };
    const squash = (x: string) => norm(x).replace(/[^a-z0-9]/g, "");
    const findDev = (name: string) => {
      const first = norm(name.split("\n")[0]);
      if (!first) return undefined;
      return (
        byName2.get(first) ??
        [...byName2.entries()].find(([n]) => n.includes(first) || first.includes(n))?.[1] ??
        [...byName2.entries()].find(([n]) => lev1(squash(n), squash(first)))?.[1]
      );
    };
    // deal matcher: street number, else distinctive street-name token
    const streetToken = (addr: string) => (addr.toLowerCase().match(/[a-z]{5,}/g) ?? []).filter((t) => !["north", "south", "street", "drive", "circle", "avenue", "court", "place", "charlotte", "springs", "coral", "beach", "valley", "county"].includes(t))[0] ?? "";
    const matchDeal = (addr: string) => {
      const num = (addr.match(/\d{3,}/) ?? [""])[0];
      if (num) { const d = deals.find((d) => d.address.includes(num)); if (d) return d; }
      const tok = streetToken(addr);
      return tok ? deals.find((d) => d.address.toLowerCase().includes(tok)) : undefined;
    };
    const createdDealByAddr = new Map<string, { id: string; address: string; contractPrice: number | null }>();
    const dealLinks: string[] = [];
    for (const f of data.feedback) {
      if (!f.developer) continue;
      const dev = findDev(f.developer);
      if (!dev) { report.skipped.push(`feedback: no buyer "${f.developer.split("\n")[0]}"`); continue; }
      const note = `${f.address}${f.ask ? ` (ask ${f.ask.slice(0, 40)})` : ""} — ${f.feedback}`.slice(0, 400);
      const pass = /not interested|no offer|pass|full of/i.test(f.feedback);
      const reason = /road|utilit|electric|flood|scrub|area|undevelop/i.test(f.feedback) ? "area" : /price|offer|\$/.test(f.feedback) ? "price" : "other";
      if (commit) {
        const { logTouch } = await import("@/lib/buyers/write");
        await logTouch(dev.id, { channel: "email", outcome: pass ? "pass" : "replied", note }, "excel-import");
        report.touches++;
      }
      // one DealSend per address line ("addr - Reason: Flood Zone" lines included)
      const lines = f.address.split(/\n/).map((l) => l.replace(/\s*-\s*Reason:.*$/i, "").trim()).filter((l) => l.length > 5);
      for (const line of lines) {
        let deal = matchDeal(line) ?? createdDealByAddr.get(squash(line));
        let createdHere = false;
        if (!deal) {
          createdHere = true;
          const askNum = Number((f.ask ?? "").replace(/[^0-9.]/g, "")) || null;
          if (commit) {
            const row = await db.deal.create({ data: { address: line, status: "dead", active: false, askingPrice: askNum, notes: "Imported from dispo follow-up Excel — historical land-deal send record.", source: "excel-import" } });
            deal = { id: row.id, address: row.address, contractPrice: null };
          } else {
            deal = { id: "would-create", address: line, contractPrice: null };
          }
          createdDealByAddr.set(squash(line), deal);
        }
        dealLinks.push(`${dev.name} ← ${deal.address}${createdHere ? " (new archived deal)" : ""}${pass ? ` [pass:${reason}]` : ""}`);
        if (commit && deal.id !== "would-create") {
          // idempotent: never duplicate an excel-import send for the same pair
          const dup = await db.dealSend.findFirst({ where: { dealId: deal.id, buyerId: dev.id, actor: "excel-import" }, select: { id: true } });
          if (dup) continue;
          const { logDealSend, setDealSendOutcome } = await import("@/lib/buyers/feedback");
          const sendId = await logDealSend({ dealId: deal.id, buyerId: dev.id, channel: "email", floorPrice: deal.contractPrice, actor: "excel-import" });
          await setDealSendOutcome(sendId, { outcome: pass ? "pass" : "", passReason: pass ? reason : "", note: f.feedback.slice(0, 300) }, "excel-import");
        }
        report.dealSends++;
      }
    }
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", wouldCreate: report.created.length, wouldMatch: report.matched.length, touches: report.touches, dealSends: report.dealSends, newArchivedDeals: createdDealByAddr.size, dealLinks, created: report.created, matched: report.matched, skipped: report.skipped });
  }

  // 📅 CRM appointment alarms — piggybacks on EVERY cron hit (≈20/day), so a
  // reminder lands in the huddle chat within the hour before the appointment.
  try {
    const soon = await db.crmAppointment.findMany({ where: { remindedAt: null, at: { gte: new Date(), lte: new Date(Date.now() + 75 * 60_000) } }, take: 10 });
    if (soon.length) {
      const { sendHuddleChat } = await import("@/lib/notify");
      for (const a of soon) {
        const mins = Math.max(1, Math.round((a.at.getTime() - Date.now()) / 60_000));
        await sendHuddleChat(`⏰ *Appointment in ${mins}m* — ${a.title} (${a.withWho})${a.note ? ` · ${a.note}` : ""}\nhttps://kpi-tracker-lovat.vercel.app/crm/${a.oppId}`);
        await db.crmAppointment.update({ where: { id: a.id }, data: { remindedAt: new Date() } });
      }
    }
  } catch { /* alarms never break a cron */ }

  // One-time: register the Resend webhook so opens/clicks land on timelines.
  if (url.searchParams.get("resendhook") === "1") {
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "RESEND_API_KEY missing" });
    const res = await fetch("https://api.resend.com/webhooks", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://kpi-tracker-lovat.vercel.app/api/resend/events", events: ["email.opened", "email.clicked", "email.bounced", "email.complained"] }),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; secret?: string; signing_secret?: string; message?: string };
    if (res.ok && body.id) {
      const row = await db.resource.findFirst({ where: { category: "__resend_hook__" } });
      const description = JSON.stringify({ id: body.id, secret: body.secret ?? body.signing_secret ?? "" });
      if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
      else await db.resource.create({ data: { title: "resend-hook", category: "__resend_hook__", url: "", description } });
    }
    return NextResponse.json({ ok: res.ok, status: res.status, id: body.id ?? null, hasSecret: !!(body.secret ?? body.signing_secret), note: res.ok ? "Enable open/click tracking on the domain in Resend → Domains for opens to fire." : (body.message ?? "register failed — can also be added by hand in Resend → Webhooks") });
  }

  // 📧 Email-sequence runner (the in-house Direct REI drip). Daily: sends the
  // step that's due, auto-stops the moment a lead has replied, logs everything.
  if (url.searchParams.get("seqrun") === "1") {
    const { readSequences, readSeqState, writeSeqState, fillTemplate } = await import("@/lib/crm-templates");
    const { sendEmailTo } = await import("@/lib/notify");
    const { logCrmEvent } = await import("@/lib/crm");
    const today = new Date().toISOString().slice(0, 10);
    const seqs = await readSequences();
    const state = await readSeqState();
    let sent = 0, stopped = 0, completed = 0;
    for (const [oppId, st] of Object.entries(state)) {
      if (st.nextYmd > today) continue;
      const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, include: { contact: true } });
      const seq = seqs.find((x) => x.id === st.seqId);
      if (!opp || !seq || opp.archivedAt || ["dead", "signed", "contract_sent"].includes(opp.stage)) { delete state[oppId]; continue; }
      // reply-stop: any inbound message since enrollment kills the drip
      const replied = await db.crmEvent.findFirst({ where: { contactId: opp.contactId, kind: { in: ["sms", "email"] }, body: { startsWith: "⬅️" }, at: { gte: new Date(st.startedYmd + "T00:00:00Z") } }, select: { id: true } });
      if (replied) {
        delete state[oppId];
        stopped++;
        await db.crmTask.create({ data: { contactId: opp.contactId, oppId, title: "📬 They replied — sequence stopped, call them!", due: today, assignedTo: opp.assignedTo, createdBy: "sequence" } }).catch(() => {});
        await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body: "Sequence auto-stopped — the lead replied 🎉", actor: "sequence" });
        continue;
      }
      const step = seq.steps[st.step];
      if (!step) { delete state[oppId]; completed++; continue; }
      const vars = { name: opp.contact.name, rep: opp.assignedTo || "Jon" };
      const ok = await sendEmailTo([st.email], fillTemplate(step.subject, vars), `<p>${fillTemplate(step.body, vars).replace(/\n/g, "<br>")}</p>`, undefined, process.env.CASCADE_REPLY_TO || "info@freedom-offers.com");
      await logCrmEvent({ contactId: opp.contactId, oppId, kind: "email", body: `➡️ Us (sequence ${st.step + 1}/${seq.steps.length}): ${fillTemplate(step.subject, vars)}${ok ? "" : " (SEND FAILED)"}`, actor: "sequence" });
      if (ok) sent++;
      const nextStep = seq.steps[st.step + 1];
      if (nextStep) {
        st.step += 1;
        st.nextYmd = new Date(Date.parse(st.startedYmd + "T12:00:00Z") + nextStep.day * 86400000).toISOString().slice(0, 10);
      } else {
        delete state[oppId];
        completed++;
        await logCrmEvent({ contactId: opp.contactId, oppId, kind: "system", body: `Sequence "${seq.name}" completed — all ${seq.steps.length} emails sent`, actor: "sequence" });
      }
    }
    await writeSeqState(state);
    return NextResponse.json({ ok: true, enrolled: Object.keys(state).length, sent, stopped, completed });
  }

  // 🧾 Daily CRM digest per rep → huddle chat (stale leads can't hide).
  if (url.searchParams.get("crmdigest") === "1") {
    const { sendHuddleChat } = await import("@/lib/notify");
    const today = new Date().toISOString().slice(0, 10);
    const reps = await db.user.findMany({ where: { active: true, position: { in: ["acquisitions", "cc_lm", "dispositions"] } }, select: { name: true } });
    const lines = ["🧲 *Seller CRM — morning digest*"];
    for (const r of reps) {
      const [open, fuDue, tasksDue, quiet] = await Promise.all([
        db.crmOpportunity.count({ where: { assignedTo: r.name, archivedAt: null } }),
        db.crmOpportunity.count({ where: { assignedTo: r.name, archivedAt: null, nextFollowUp: { not: "", lte: today } } }),
        db.crmTask.count({ where: { assignedTo: r.name, doneAt: null, due: { not: "", lte: today } } }),
        db.crmOpportunity.count({ where: { assignedTo: r.name, archivedAt: null, stage: { notIn: ["nurture", "dead", "signed"] }, updatedAt: { lte: new Date(Date.now() - 3 * 86400000) } } }),
      ]);
      if (!open) continue;
      lines.push(`• *${r.name.split(" ")[0]}*: ${open} leads · 📞 ${fuDue} follow-ups due · ⏰ ${tasksDue} tasks due${quiet ? ` · 🕸 ${quiet} quiet 3d+` : ""}`);
    }
    lines.push("https://kpi-tracker-lovat.vercel.app/crm");
    const sent = await sendHuddleChat(lines.join("\n"));
    return NextResponse.json({ ok: true, sent });
  }

  // 🧽 Strip HTML out of already-imported notes (display is clean either way;
  // this fixes the stored text). Run until changed=0.
  if (url.searchParams.get("notesclean") === "1") {
    const { stripHtml } = await import("@/lib/crm-shared");
    const rows = await db.crmEvent.findMany({ where: { body: { contains: "<" } }, select: { id: true, body: true }, take: 400 });
    let changed = 0;
    for (const r of rows) {
      if (!/<[a-zA-Z!\/]/.test(r.body)) continue; // only HTML-tag-like text — never munch a literal "<"
      const clean = stripHtml(r.body).slice(0, 2000);
      if (clean !== r.body) { await db.crmEvent.update({ where: { id: r.id }, data: { body: clean } }); changed++; }
    }
    return NextResponse.json({ ok: true, scanned: rows.length, changed });
  }

  // 📝 GHL notes backfill — contacts imported without notes get them here
  // (time-guarded; run repeatedly until done=0 remaining).
  if (url.searchParams.get("ghlnotes") === "1") {
    const { ghlGet } = await import("@/lib/reireply");
    const deadline = Date.now() + 45_000;
    const candidates = await db.crmContact.findMany({ where: { ghlId: { not: "" }, archivedAt: null }, select: { id: true, ghlId: true }, orderBy: { createdAt: "desc" }, take: 400 });
    let checked = 0, notes = 0, withNotes = 0;
    for (const c of candidates) {
      if (Date.now() > deadline) break;
      const has = await db.crmEvent.findFirst({ where: { contactId: c.id, actor: "GHL import" }, select: { id: true } });
      if (has) { withNotes++; continue; }
      checked++;
      const nres = await ghlGet(`/contacts/${c.ghlId}/notes`);
      const nbody = nres.body as { notes?: Array<{ body?: string; dateAdded?: string }> };
      const list = (nbody.notes ?? []).slice(0, 50);
      if (!list.length) {
        await db.crmEvent.create({ data: { contactId: c.id, kind: "system", body: "GHL: no notes on file", actor: "GHL import", at: new Date() } }).catch(() => {});
        continue;
      }
      const { stripHtml } = await import("@/lib/crm-shared");
      for (const n of list) {
        if (!n.body) continue;
        await db.crmEvent.create({ data: { contactId: c.id, kind: "note", body: stripHtml(String(n.body)).slice(0, 2000), actor: "GHL import", at: n.dateAdded ? new Date(n.dateAdded) : new Date() } }).catch(() => {});
        notes++;
      }
    }
    return NextResponse.json({ ok: true, checkedThisRun: checked, notesImported: notes, alreadyDone: withNotes, remaining: Math.max(0, candidates.length - withNotes - checked) });
  }

  // 💬 Sync GHL texts + emails onto each CRM lead's timeline (Jon 2026-10-07:
  // "all emails and texts synced to each lead"). Dedupes by GHL message id;
  // time-guarded for the 60s cap; cron runs it 4×/day while GHL stays live.
  if (url.searchParams.get("crmmsgsync") === "1") {
    const { searchConversations, getMessages } = await import("@/lib/reireply");
    const deadline = Date.now() + 45_000;
    // round-robin: least-recently-synced first; touching updatedAt after a
    // sync sends the contact to the back of the queue, so every lead gets
    // covered across the day's runs.
    const contacts = await db.crmContact.findMany({ where: { ghlId: { not: "" }, archivedAt: null }, orderBy: { updatedAt: "asc" }, take: Number(url.searchParams.get("n")) || 40, select: { id: true, ghlId: true } });
    let scanned = 0, inserted = 0;
    for (const c of contacts) {
      if (Date.now() > deadline) break;
      await db.crmContact.update({ where: { id: c.id }, data: { updatedAt: new Date() } }).catch(() => {});
      const convs = await searchConversations({ contactId: c.ghlId });
      const cb = convs.body as { conversations?: Array<{ id?: string }> };
      const convIds = (cb.conversations ?? []).map((x) => String(x.id ?? "")).filter(Boolean).slice(0, 3);
      if (!convIds.length) continue;
      // existing message ids for this contact (cheap dedupe set)
      const prior = await db.crmEvent.findMany({ where: { contactId: c.id, kind: { in: ["sms", "email"] } }, select: { meta: true }, take: 500 });
      const seen = new Set(prior.map((e) => (e.meta as { msgId?: string } | null)?.msgId).filter(Boolean));
      for (const convId of convIds) {
        if (Date.now() > deadline) break;
        const mres = await getMessages(convId);
        const mb = mres.body as { messages?: { messages?: Array<Record<string, unknown>> } | Array<Record<string, unknown>> };
        const list = (Array.isArray(mb.messages) ? mb.messages : mb.messages?.messages) ?? [];
        for (const m of list.slice(0, 25)) {
          scanned++;
          const type = String(m.messageType ?? m.type ?? "");
          const isSms = /SMS|TYPE_SMS/i.test(type);
          const isEmail = /EMAIL/i.test(type);
          if (!isSms && !isEmail) continue;
          const msgId = String(m.id ?? "");
          if (!msgId || seen.has(msgId)) continue;
          const dir = String(m.direction ?? "");
          const bodyTxt = String(m.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600);
          if (!bodyTxt) continue;
          await db.crmEvent.create({ data: {
            contactId: c.id, kind: isSms ? "sms" : "email",
            body: `${dir === "inbound" ? "⬅️ Seller" : "➡️ Us"}: ${bodyTxt}`,
            meta: { msgId, dir, via: "ghl" } as never, actor: "ghl-sync",
            at: m.dateAdded ? new Date(String(m.dateAdded)) : new Date(),
          } }).catch(() => {});
          seen.add(msgId); inserted++;
        }
      }
    }
    return NextResponse.json({ ok: true, contactsChecked: contacts.length, messagesScanned: scanned, inserted });
  }

  // 📬 Resend tracking (?resendtrack=1): flip open+click tracking ON for our
  // sending domain via API (the punch-list toggle Jon never had to click) —
  // opens/clicks then land on lead timelines through /api/resend/events.
  if (url.searchParams.get("resendtrack") === "1") {
    const key = process.env.RESEND_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "no RESEND_API_KEY" });
    const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    const list = await fetch("https://api.resend.com/domains", { headers: H, cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const domains = ((list as { data?: Array<{ id: string; name: string }> }).data ?? []);
    const results: Record<string, string> = {};
    for (const d of domains) {
      const r = await fetch(`https://api.resend.com/domains/${d.id}`, {
        method: "PATCH", headers: H,
        body: JSON.stringify({ open_tracking: true, click_tracking: true }),
      }).catch(() => null);
      results[d.name] = r?.ok ? "tracking ON" : `failed ${r?.status ?? "network"}`;
    }
    return NextResponse.json({ ok: true, results });
  }

  // ☎️ Twilio audit (?twilioaudit=1): every number on the account with its
  // 30-day call/text activity — the "which numbers are dead rent" report for
  // the Telnyx-consolidation decision. Read-only; stores __twilio_audit__.
  if (url.searchParams.get("twilioaudit") === "1") {
    const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !tok) return NextResponse.json({ ok: false, error: "no Twilio creds" });
    const auth = "Basic " + Buffer.from(`${sid}:${tok}`).toString("base64");
    const tw = async (path: string) => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, { headers: { Authorization: auth }, cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const nums = (await tw("/IncomingPhoneNumbers.json?PageSize=400")) as { incoming_phone_numbers?: Array<{ phone_number?: string; friendly_name?: string }> };
    const owned = (nums.incoming_phone_numbers ?? []).map((n) => n.phone_number ?? "").filter(Boolean);
    const act: Record<string, { calls: number; msgs: number; last: string }> = {};
    for (const n of owned) act[n] = { calls: 0, msgs: 0, last: "" };
    const bump = (n: string | undefined, kind: "calls" | "msgs", when: string) => {
      if (!n || !act[n]) return;
      act[n][kind]++;
      const d = new Date(when).toISOString().slice(0, 10);
      if (d > act[n].last) act[n].last = d;
    };
    for (let page = 0; page < 3; page++) {
      const j = (await tw(`/Calls.json?PageSize=1000&Page=${page}&StartTime%3E=${since}`)) as { calls?: Array<{ from?: string; to?: string; start_time?: string }> };
      for (const c of j.calls ?? []) { bump(c.from, "calls", c.start_time ?? ""); bump(c.to, "calls", c.start_time ?? ""); }
      if ((j.calls ?? []).length < 1000) break;
    }
    for (let page = 0; page < 3; page++) {
      const j = (await tw(`/Messages.json?PageSize=1000&Page=${page}&DateSent%3E=${since}`)) as { messages?: Array<{ from?: string; to?: string; date_sent?: string }> };
      for (const m of j.messages ?? []) { bump(m.from, "msgs", m.date_sent ?? ""); bump(m.to, "msgs", m.date_sent ?? ""); }
      if ((j.messages ?? []).length < 1000) break;
    }
    const report = owned.map((n) => ({ number: n, name: (nums.incoming_phone_numbers ?? []).find((x) => x.phone_number === n)?.friendly_name ?? "", ...act[n] }))
      .sort((a, b) => (a.calls + a.msgs) - (b.calls + b.msgs));
    const dead = report.filter((r) => r.calls + r.msgs === 0);
    const summary = {
      at: new Date().toISOString(), windowDays: 30, totalNumbers: owned.length,
      estMonthlyRent: Number((owned.length * 1.15).toFixed(2)),
      deadNumbers: dead.length, deadMonthlyWaste: Number((dead.length * 1.15).toFixed(2)),
      numbers: report,
    };
    const row = await db.resource.findFirst({ where: { category: "__twilio_audit__" } });
    const description = JSON.stringify(summary);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "twilio-audit", category: "__twilio_audit__", url: "", description } });
    return NextResponse.json({ ok: true, ...summary });
  }

  // 📡 Telnyx spend (?telnyxspend=1, daily cron): month-to-date cost from
  // detail records (voice + messaging, covers War Room AND Direct REI lines),
  // current balance, and a straight-line monthly projection → Resource
  // __telnyx_spend__ for the P&L card.
  if (url.searchParams.get("telnyxspend") === "1") {
    const key = process.env.TELNYX_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "no TELNYX_API_KEY" });
    const tx = async (path: string) => {
      const res = await fetch(`https://api.telnyx.com/v2${path}`, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
      return (await res.json().catch(() => ({}))) as { data?: unknown; meta?: { total_pages?: number } };
    };
    const sumKind = async (recordType: string) => {
      let total = 0, count = 0, short = 0;
      for (let page = 1; page <= 5; page++) {
        const j = await tx(`/detail_records?filter[record_type]=${recordType}&filter[date_range]=this_month&page[size]=1000&page[number]=${page}`);
        const rows = (j.data ?? []) as Array<{ cost?: string | number; rate?: string | number; call_sec?: number; billed_sec?: number; duration?: number; call_duration?: number }>;
        for (const r of rows) {
          total += Math.abs(Number(r.cost ?? 0)) || 0; count++;
          const secs = Number(r.call_sec ?? r.billed_sec ?? r.call_duration ?? r.duration ?? NaN);
          if (!Number.isNaN(secs) && secs <= 6) short++;
        }
        if (rows.length < 1000) break;
      }
      return { total, count, short };
    };
    // Twilio side (same card): this-month usage + balance, Basic auth
    const twSid = process.env.TWILIO_ACCOUNT_SID, twTok = process.env.TWILIO_AUTH_TOKEN;
    const twAuth = twSid && twTok ? "Basic " + Buffer.from(`${twSid}:${twTok}`).toString("base64") : "";
    const tw = async (path: string) => twAuth
      ? fetch(`https://api.twilio.com/2010-04-01/Accounts/${twSid}${path}`, { headers: { Authorization: twAuth }, cache: "no-store" }).then((r) => r.json()).catch(() => null)
      : null;
    const [msg, voice, balRes, twUsage, twBal] = await Promise.all([
      sumKind("messaging"), sumKind("voice"),
      fetch("https://api.telnyx.com/v2/balance", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      tw("/Usage/Records/ThisMonth.json?PageSize=400"),
      tw("/Balance.json"),
    ]);
    const bal = (balRes as { data?: { balance?: string; currency?: string } }).data;
    let twilioMtd: number | null = null; let twilioSms = 0; let twilioVoice = 0;
    const twRecs = (twUsage as { usage_records?: Array<{ category?: string; price?: string | number }> } | null)?.usage_records;
    if (twRecs) {
      twilioMtd = 0;
      for (const r of twRecs) {
        const p = Number(r.price ?? 0) || 0;
        twilioMtd += p;
        if (/sms|messag/i.test(r.category ?? "")) twilioSms += p;
        if (/call|voice|minute/i.test(r.category ?? "")) twilioVoice += p;
      }
    }
    const twilioBalance = twBal && (twBal as { balance?: string }).balance != null ? Number((twBal as { balance?: string }).balance) : null;
    const day = new Date().getUTCDate();
    const daysInMonth = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 0).getDate();
    const mtd = msg.total + voice.total;
    const snapshot = {
      at: new Date().toISOString(),
      month: new Date().toISOString().slice(0, 7),
      sms: { cost: Number(msg.total.toFixed(2)), count: msg.count },
      voice: { cost: Number(voice.total.toFixed(2)), count: voice.count },
      // 💸 Telnyx surcharges accounts whose calls ≤6s exceed 15% of volume
      shortCalls: { count: voice.short, pct: voice.count ? Number(((voice.short / voice.count) * 100).toFixed(1)) : 0 },
      mtd: Number(mtd.toFixed(2)),
      projected: Number(((mtd / Math.max(1, day)) * daysInMonth).toFixed(2)),
      balance: bal?.balance != null ? Number(bal.balance) : null,
      twilio: twilioMtd != null ? {
        mtd: Number(twilioMtd.toFixed(2)), sms: Number(twilioSms.toFixed(2)), voice: Number(twilioVoice.toFixed(2)),
        projected: Number(((twilioMtd / Math.max(1, day)) * daysInMonth).toFixed(2)),
        balance: twilioBalance,
      } : null,
    };
    const row = await db.resource.findFirst({ where: { category: "__telnyx_spend__" } });
    const description = JSON.stringify(snapshot);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-spend", category: "__telnyx_spend__", url: "", description } });
    return NextResponse.json({ ok: true, ...snapshot });
  }

  // 🗑 Stage removal (?stagedrop=1&match=<regex>&commit=1): delete matching
  // stages from every pipeline in __crm_pipelines__; leads sitting in them
  // move to the pipeline's regular appointment stage (or the stage before).
  if (url.searchParams.get("stagedrop") === "1") {
    const commit = url.searchParams.get("commit") === "1";
    const rxStr = url.searchParams.get("match") || "ip apt";
    const rx = new RegExp(rxStr, "i");
    const row = await db.resource.findFirst({ where: { category: "__crm_pipelines__" } });
    if (!row?.description) return NextResponse.json({ ok: false, error: "no __crm_pipelines__" });
    let pls: Array<{ name: string; stages: Array<{ key: string; label: string }> }> = [];
    try { pls = JSON.parse(row.description); } catch { return NextResponse.json({ ok: false, error: "bad pipelines json" }); }
    const report: Record<string, { removed: string[]; movedTo: string; leadsMoved: number }> = {};
    for (const p of pls) {
      const drop = p.stages.filter((s) => rx.test(s.label) || rx.test(s.key));
      if (!drop.length) continue;
      const keep = p.stages.filter((s) => !drop.includes(s));
      // destination: the surviving regular apt stage, else the stage before the dropped one
      const dest = keep.find((s) => /apt|appointment/i.test(s.label) && !rx.test(s.label))
        ?? keep[Math.max(0, p.stages.indexOf(drop[0]) - 1)] ?? keep[0];
      let moved = 0;
      for (const d of drop) {
        const n = await db.crmOpportunity.count({ where: { pipeline: p.name, stage: d.key, archivedAt: null } });
        moved += n;
        if (commit && dest) await db.crmOpportunity.updateMany({ where: { pipeline: p.name, stage: d.key }, data: { stage: dest.key } });
      }
      if (commit) p.stages = keep;
      report[p.name] = { removed: drop.map((d) => d.label), movedTo: dest?.label ?? "?", leadsMoved: moved };
    }
    if (commit) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(pls) } });
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", report });
  }

  // 📝 PandaDoc template probe (?pdtplprobe=1): dump both offer templates'
  // field names + signer roles so draft pre-fill maps Jon's 5 essentials
  // exactly (address, APN, seller net, seller name).
  if (url.searchParams.get("pdtplprobe") === "1") {
    const { pandadocConfigured, getTemplateDetails, PANDADOC_TEMPLATES } = await import("@/lib/pandadoc");
    if (!pandadocConfigured()) return NextResponse.json({ ok: false, error: "PANDADOC_API_KEY not set in Vercel" });
    const out: Record<string, unknown> = {};
    for (const [kind, tpl] of Object.entries(PANDADOC_TEMPLATES)) {
      const det = await getTemplateDetails(tpl.id);
      const b = det.body as { name?: string; roles?: Array<{ name?: string }>; fields?: Array<{ field_id?: string; merge_field?: string; name?: string; type?: string; assigned_to?: { name?: string } }>; tokens?: Array<{ name?: string }> };
      out[kind] = det.ok ? {
        template: b.name,
        roles: (b.roles ?? []).map((r) => r.name),
        fields: (b.fields ?? []).map((f) => ({ id: f.field_id, merge: f.merge_field, label: f.name, type: f.type })),
        tokens: (b.tokens ?? []).map((t) => t.name),
      } : { error: `${det.status}: ${JSON.stringify(det.body).slice(0, 200)}` };
    }
    return NextResponse.json({ ok: true, templates: out });
  }

  // 💾 Off-site backup (?fullbackup=1, daily cron): the ENTIRE database as
  // gzipped JSON into a private "War Room Backups" folder on the Google
  // Shared Drive — survives Vercel/Supabase dying, costs none of our server
  // space (it's the Workspace storage), readable only by the service account.
  if (url.searchParams.get("fullbackup") === "1") {
    const { gdriveConfigured, ensureSubfolder, uploadToFolder, driveRootId } = await import("@/lib/gdrive");
    if (!gdriveConfigured()) return NextResponse.json({ ok: false, error: "Google Drive not configured" });
    try {
      const { buildBackup } = await import("@/lib/backup");
      const { gzipSync } = await import("zlib");
      const backup = await buildBackup();
      const json = JSON.stringify(backup);
      const gz = gzipSync(Buffer.from(json));
      // Shared Drive root (service accounts have no My Drive quota)
      const folder = await ensureSubfolder(await driveRootId(), "War Room Backups");
      const name = `war-room-${new Date().toISOString().slice(0, 10)}.json.gz`;
      const up = await uploadToFolder(folder, name, new Uint8Array(gz), "application/gzip");
      return NextResponse.json({ ok: true, file: name, bytes: gz.length, rawBytes: json.length, driveId: up.id });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }, { status: 500 });
    }
  }

  // 🔬 Stage report (?stagereport=1): pipeline × stage × count ground truth
  // (diagnosing the 27-vs-112 board mismatch).
  if (url.searchParams.get("stagereport") === "1") {
    const rows = await db.crmOpportunity.groupBy({ by: ["pipeline", "stage"], where: { archivedAt: null }, _count: { _all: true } });
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const pl = r.pipeline || "War Room";
      out[pl] = out[pl] ?? {};
      out[pl][r.stage] = r._count._all;
    }
    const plRow = await db.resource.findFirst({ where: { category: "__crm_pipelines__" } });
    let plDef: unknown = null; try { plDef = plRow?.description ? JSON.parse(plRow.description) : null; } catch { /* raw */ }
    return NextResponse.json({ ok: true, dbCounts: out, pipelineDefinitions: plDef });
  }

  // 📈 Perf & data-growth watchdog (?perfsnap=1, daily cron — Jon 2026-10-08:
  // "the system has to be lightning fast and protected 100%"). Snapshots row
  // counts, side-store sizes and two live query timings; keeps a 90-day trend
  // in __perf_snapshots__ and drops a 🛠 Jon task when something balloons.
  if (url.searchParams.get("perfsnap") === "1") {
    const t0 = Date.now();
    const [opps, contacts, events, tasksN, appts, mkt, touches, resources] = await Promise.all([
      db.crmOpportunity.count(), db.crmContact.count(), db.crmEvent.count(), db.crmTask.count(),
      db.crmAppointment.count(), db.marketContact.count(), db.buyerTouch.count(),
      db.resource.findMany({ where: { category: { startsWith: "__" } }, select: { category: true, description: true } }),
    ]);
    const tCounts = Date.now() - t0;
    // live timing probes: the two pages the team actually feels
    const tb0 = Date.now();
    await db.crmOpportunity.groupBy({ by: ["stage"], where: { archivedAt: null }, _count: { _all: true } });
    const tBoard = Date.now() - tb0;
    const tv0 = Date.now();
    await db.marketContact.findMany({ where: { archivedAt: null, vetStage: { notIn: ["vetted", "active"] } }, select: { id: true }, take: 2000 });
    const tVet = Date.now() - tv0;
    const stores: Record<string, number> = {};
    let storeTotal = 0;
    for (const r of resources) { const kb = Math.round((r.description?.length ?? 0) / 1024); stores[r.category] = (stores[r.category] ?? 0) + kb; storeTotal += kb; }
    const snap = { at: new Date().toISOString(), rows: { opps, contacts, events, tasks: tasksN, appts, mkt, touches }, storeKb: storeTotal, bigStores: Object.fromEntries(Object.entries(stores).filter(([, v]) => v > 100)), ms: { counts: tCounts, board: tBoard, vetting: tVet } };
    const PERF_CAT = "__perf_snapshots__";
    const row = await db.resource.findFirst({ where: { category: PERF_CAT } });
    let hist: Array<typeof snap> = [];
    try { hist = row?.description ? JSON.parse(row.description) : []; } catch { hist = []; }
    const weekAgo = hist.find((h) => Date.now() - new Date(h.at).getTime() > 6.5 * 86400_000);
    hist.unshift(snap); hist = hist.slice(0, 90);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(hist) } });
    else await db.resource.create({ data: { title: "perf-snapshots", category: PERF_CAT, url: "", description: JSON.stringify(hist) } });
    // alarms → 🛠 Jon task (dup-guarded)
    const alarms: string[] = [];
    if (tBoard > 1500) alarms.push(`CRM board count query took ${tBoard}ms`);
    if (tVet > 1500) alarms.push(`Buyer Research query took ${tVet}ms`);
    const bigStore = Object.entries(stores).find(([, v]) => v > 800);
    if (bigStore) alarms.push(`side-store ${bigStore[0]} is ${bigStore[1]}KB — needs a trim/offload`);
    if (weekAgo) {
      for (const [k, v] of Object.entries(snap.rows)) {
        const old = (weekAgo.rows as Record<string, number>)[k] ?? 0;
        if (old > 500 && v > old * 2) alarms.push(`${k} doubled in a week (${old} → ${v})`);
      }
    }
    if (alarms.length) {
      const title = `🛠 Perf watchdog: ${alarms[0]}${alarms.length > 1 ? ` (+${alarms.length - 1} more)` : ""}`;
      const jon = await db.user.findFirst({ where: { active: true, name: { startsWith: "Jon", mode: "insensitive" } }, select: { name: true } });
      const dup = await db.crmTask.findFirst({ where: { title, doneAt: null } });
      if (!dup) await db.crmTask.create({ data: { oppId: "", contactId: "", title, due: new Date().toISOString().slice(0, 10), assignedTo: jon?.name ?? "Jon Cruz", createdBy: "perf-watchdog" } });
    }
    return NextResponse.json({ ok: true, snap, alarms });
  }

  // 🔑 Service-account info (?gsainfo=1): client_email + the numeric client_id
  // that Google Admin's domain-wide delegation entry must match.
  if (url.searchParams.get("gsainfo") === "1") {
    try {
      const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
      return NextResponse.json({ ok: true, client_email: sa.client_email ?? null, client_id: sa.client_id ?? null });
    } catch { return NextResponse.json({ ok: false, error: "bad SA json" }); }
  }

  // 📬 Gmail DWD test (?gmailtest=1&as=info@freedom-offers.com): mints a
  // delegated token and reads the mailbox profile — proves the Admin-console
  // delegation entry is correct before the offer-scan ships.
  if (url.searchParams.get("gmailtest") === "1") {
    const asUser = url.searchParams.get("as") || "info@freedom-offers.com";
    try {
      const crypto = await import("crypto");
      const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
      const now = Math.floor(Date.now() / 1000);
      const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const head = enc({ alg: "RS256", typ: "JWT" });
      const claims = enc({ iss: sa.client_email, sub: asUser, scope: "https://www.googleapis.com/auth/gmail.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
      const signer = crypto.createSign("RSA-SHA256");
      signer.update(`${head}.${claims}`); signer.end();
      const sig = signer.sign(sa.private_key).toString("base64url");
      const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }) }).then((r) => r.json());
      if (!tok.access_token) return NextResponse.json({ ok: false, step: "token", error: JSON.stringify(tok).slice(0, 250) });
      const prof = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
      return NextResponse.json({ ok: !!prof.emailAddress, profile: prof });
    } catch (e) { return NextResponse.json({ ok: false, error: String(e).slice(0, 200) }); }
  }

  // 📱 Nick's manual-dial targets (?nicktargets=1): he's 5h on an iPhone with
  // no dialer (new acq members don't get system licenses) — the 140/100
  // auto-dialer goals were impossible. Standing per-rep overrides.
  if (url.searchParams.get("nicktargets") === "1") {
    const nick = await db.user.findFirst({ where: { active: true, OR: [{ name: { startsWith: "Nick", mode: "insensitive" } }, { name: { startsWith: "Nicholas", mode: "insensitive" } }] }, select: { id: true, name: true } });
    if (!nick) return NextResponse.json({ ok: false, error: "no Nick user" });
    const GOALS: Record<string, number> = { outbound_calls: 60, connected_calls: 15 };
    const set: Record<string, number> = {};
    for (const [key, goalValue] of Object.entries(GOALS)) {
      const kpi = await db.kpi.findUnique({ where: { key }, select: { id: true } });
      if (!kpi) continue;
      const existing = await db.target.findFirst({ where: { kpiId: kpi.id, userId: nick.id, period: null } });
      if (existing) await db.target.update({ where: { id: existing.id }, data: { goalValue } });
      else await db.target.create({ data: { kpiId: kpi.id, userId: nick.id, period: null, goalValue } });
      set[key] = goalValue;
    }
    return NextResponse.json({ ok: true, user: nick.name, set });
  }

  // 📎 Signed-doc puller (?pdpull=1, daily cron): PandaDoc completed docs from
  // the last 7 days → signed PDF saved to the Shared Drive "Deal Files"
  // folder → 📎 file event on the matching OPPORTUNITY (metadata.oppId from
  // our drafts, else address-match on the doc name). Storage SOP: files live
  // on Drive, never in Vercel/Supabase.
  if (url.searchParams.get("pdpull") === "1") {
    const { pandadocConfigured, listCompletedDocs, getDocDetails, downloadDocPdf } = await import("@/lib/pandadoc");
    if (!pandadocConfigured()) return NextResponse.json({ ok: false, error: "no PANDADOC_API_KEY" });
    const { gdriveConfigured, ensureSubfolder, uploadToFolder, driveRootId } = await import("@/lib/gdrive");
    if (!gdriveConfigured()) return NextResponse.json({ ok: false, error: "no Drive" });
    const { logCrmEvent } = await import("@/lib/crm");
    const to = new Date().toISOString();
    const from = new Date(Date.now() - 7 * 86400_000).toISOString();
    const list = await listCompletedDocs(from, to);
    const docs = ((list.body as { results?: Array<{ id: string; name?: string; date_completed?: string }> }).results ?? []).slice(0, 15);
    // Jon's existing ACTIVE DEALS folder (one subfolder per deal) —
    // files land inside the matching deal's folder, created if missing.
    const DEALS_PARENT = "1pfZAlmeoaa3lkP7lboWHeHkppgFjc7Ub";
    const { listFolder } = await import("@/lib/gdrive");
    const dealFolders = await listFolder(DEALS_PARENT).catch(() => []);
    const folderFor = async (label: string) => {
      const token = (label.match(/\d{2,6}\s+[A-Za-z][A-Za-z0-9 .']{2,24}/)?.[0] ?? label).trim().toLowerCase();
      const hitNum = token.match(/\d{2,6}/)?.[0];
      const hit = dealFolders.find((f) => f.mimeType === "application/vnd.google-apps.folder" && hitNum && f.name.toLowerCase().includes(hitNum));
      if (hit) return hit.id;
      return ensureSubfolder(DEALS_PARENT, label.slice(0, 80));
    };
    const fallbackFolder = await ensureSubfolder(await driveRootId(), "Deal Files");
    const results: Array<Record<string, string>> = [];
    const deadline = Date.now() + 45_000;
    for (const doc of docs) {
      if (Date.now() > deadline) { results.push({ doc: doc.name ?? doc.id, status: "deferred (budget)" }); continue; }
      const already = await db.crmEvent.findFirst({ where: { kind: "file", meta: { path: ["pdId"], equals: doc.id } }, select: { id: true } }).catch(() => null);
      if (already) continue;
      // match the opportunity: our drafts carry metadata.oppId; others by address in the doc name
      const det = await getDocDetails(doc.id);
      const meta = ((det.body as { metadata?: Record<string, string> }).metadata ?? {});
      let opp = meta.oppId ? await db.crmOpportunity.findUnique({ where: { id: meta.oppId }, select: { id: true, contactId: true, title: true } }) : null;
      if (!opp && doc.name) {
        const m = doc.name.match(/(\d{2,6}\s+[A-Za-z][A-Za-z0-9 .']{2,30}?)(?:,|$| -)/);
        const needle = m?.[1]?.trim();
        if (needle) {
          opp = await db.crmOpportunity.findFirst({ where: { OR: [{ title: { contains: needle, mode: "insensitive" } }, { contact: { address: { contains: needle, mode: "insensitive" } } }] }, select: { id: true, contactId: true, title: true }, orderBy: { updatedAt: "desc" } });
        }
      }
      const pdf = await downloadDocPdf(doc.id);
      if (!pdf) { results.push({ doc: doc.name ?? doc.id, status: "download failed" }); continue; }
      const targetFolder = await folderFor(doc.name ?? opp?.title ?? "Unsorted").catch(() => fallbackFolder);
      const up = await uploadToFolder(targetFolder, `${(doc.name ?? doc.id).replace(/[\\/]/g, "-").slice(0, 120)}.pdf`, pdf, "application/pdf").catch(() => null);
      if (!up) { results.push({ doc: doc.name ?? doc.id, status: "drive upload failed" }); continue; }
      if (opp) {
        await logCrmEvent({ contactId: opp.contactId, oppId: opp.id, kind: "file", body: `📎 Signed doc saved to Drive: ${doc.name ?? doc.id} — ${up.link}`, meta: { pdId: doc.id, driveId: up.id, link: up.link }, actor: "pandadoc" });
        results.push({ doc: doc.name ?? doc.id, status: `attached → ${opp.title.slice(0, 40)}` });
      } else {
        const jon = await db.user.findFirst({ where: { active: true, name: { startsWith: "Jon", mode: "insensitive" } }, select: { name: true } });
        await db.crmTask.create({ data: { oppId: "", contactId: "", title: `📎 Signed doc saved but UNMATCHED — file it: ${(doc.name ?? doc.id).slice(0, 110)} → ${up.link}`, due: new Date().toISOString().slice(0, 10), assignedTo: jon?.name ?? "Jon Cruz", createdBy: "pandadoc" } }).catch(() => {});
        // remember we processed it so it doesn't loop daily
        await db.crmEvent.create({ data: { contactId: (await db.crmContact.findFirst({ select: { id: true } }))!.id, oppId: "", kind: "file", body: `📎 (unmatched) ${doc.name ?? doc.id} — ${up.link}`, meta: { pdId: doc.id, driveId: up.id, link: up.link, unmatched: true } as never, actor: "pandadoc" } }).catch(() => {});
        results.push({ doc: doc.name ?? doc.id, status: "saved, unmatched → task" });
      }
    }
    return NextResponse.json({ ok: true, scanned: docs.length, results });
  }

  // 📣 Team update poster (?teamupdate=1, POST body {text}): sends to the
  // War Room Updates Google Chat space (WARROOM_CHAT_WEBHOOK).
  if (url.searchParams.get("teamupdate") === "1") {
    const hook = process.env.WARROOM_CHAT_WEBHOOK;
    if (!hook) return NextResponse.json({ ok: false, error: "no WARROOM_CHAT_WEBHOOK" });
    let text = url.searchParams.get("t") ?? "";
    try { const b = await request.json(); if (b?.text) text = String(b.text); } catch { /* query fallback */ }
    if (!text) return NextResponse.json({ ok: false, error: "no text" });
    const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 3800) }) }).catch(() => null);
    return NextResponse.json({ ok: !!r?.ok, status: r?.status ?? 0 });
  }

  // 🧾 Monthly P&L request (?pnlrequest=1, cron on the 1st): emails Viktoriia
  // + Enrico asking for last month's P&L.
  if (url.searchParams.get("pnlrequest") === "1") {
    const users = await db.user.findMany({ where: { active: true }, select: { name: true, email: true } });
    const emails = users.filter((u) => ["viktoriia", "enrico"].includes(u.name.trim().split(/\s+/)[0].toLowerCase())).map((u) => u.email).filter(Boolean);
    if (!emails.length) return NextResponse.json({ ok: false, error: "no recipient emails" });
    const prev = new Date(); prev.setUTCDate(0); // last day of previous month
    const label = prev.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const { getChannelConfig, sendEmailTo } = await import("@/lib/notify");
    const cfg = await getChannelConfig();
    const ok = await sendEmailTo(emails, `📊 ${label} P&L time`, `<p>Hi team,</p><p>It's the 1st — please send Jon the <b>${label}</b> P&L and enter it on the War Room's <a href="https://kpi-tracker-lovat.vercel.app/expenses">Profit &amp; Loss page</a> when ready.</p><p>— the War Room (automated monthly reminder)</p>`, cfg);
    return NextResponse.json({ ok, sent: emails.length });
  }

  // 🤝 JV partner + iBuyer seed (?jvseed=1): national dispo channels Jon vetted
  // (2026-10-08) land in Vetted Buyers as jv_partner / ibuyer rows with the
  // full submission playbook in notes. Idempotent by name.
  if (url.searchParams.get("jvseed") === "1") {
    const SEED = [
      { name: "MaxDispo (Maximilian Dier)", type: "jv_partner", website: "https://maxdispo.com/#dispo", phone: "1-855-873-4776", buyBox: "ALL 50 STATES — cash, novation, sub-to, seller finance, LAND, multifamily", notes: "JV split 50/50 standard (VIP reduced) OR fee-on-top (we keep 100% of assignment, they add their fee). Interest within 48h, 'closing table in 3 days'. Submit: online form at maxdispo.com (financing type, deal type, structure, location). Phone 1 855 US DISPO. Run by 'The Wholesale Pirate' — hundreds of JV closes, $1M+ in fees. TOP priority for land JVs." },
      { name: "Novation JV Submission (40% net)", type: "jv_partner", website: "https://novationjvsubmission.com/", buyBox: "ANY location, ANY condition — motivated seller required; novation specialists", notes: "We get 40% of NET profit at close; extra expenses split 50/50 OR one side fronts and gets reimbursed at closing +100% return. Submit via Podio form: podio.com/webforms/28613423/2296179 — needs seller timeline, condition, asking price, situation/motivation. ⚠️ RULE: never mention 'novation' or a partner to the seller." },
      { name: "Ready To Assign", type: "jv_partner", website: "https://www.readytoassign.com/deals", phone: "424-213-6641", email: "readytoassignnow@gmail.com", buyBox: "SFH, multifamily, commercial — must be ≤95% of Zillow price, NO daisy chains (direct contract only)", notes: "Pasadena CA (251 S. Lake Ave #800). 2–7 days to market + find buyer. Submit on /deals form: our name/email/phone, address, bed/bath, sqft, title/escrow + access info, roof/water-heater/HVAC age, contract price, EMD, projected close date, photo links (Drive/Dropbox), signed PA copy." },
      { name: "Tony Mont JV", type: "jv_partner", website: "https://go.thetonymont.com/jv", buyBox: "Wholesale JV — property types/terms not published (ask on submit)", notes: "Submit form needs: contact + org, property address/beds/baths/sqft/year, acquisition price + asking + ARV, TWO comps, photos, inspection/closing dates, occupancy, HOA, original purchase agreement. Terms/split disclosed after submission — pin them down before sending a deal." },
      { name: "Opendoor (iBuyer)", type: "ibuyer", website: "https://www.opendoor.com/", buyBox: "HOUSES ONLY (no land) — instant cash offers in ~50 metros incl TX/TN/FL", notes: "Dispo play: request an instant offer with the property address on any HOUSE deal — free price floor + potential instant exit. Offer in minutes-days, flexible close. Not for vacant land." },
      { name: "Offerpad (iBuyer)", type: "ibuyer", website: "https://www.offerpad.com/", buyBox: "HOUSES ONLY — instant offers, ~25 metros, flexible close dates", notes: "Same play as Opendoor — always pull BOTH offers on house deals and keep the higher as the floor. 3-day close possible. Not for land." },
      { name: "Orchard (Move First)", type: "ibuyer", website: "https://orchard.com/services/move-first", buyBox: "HOUSES — buy-before-you-sell program, select metros (TX/CO/GA…)", notes: "Less a direct buyer, more a guaranteed-backup-offer + listing model. Useful on novations: their guaranteed offer can backstop a retail listing. Not for land." },
      { name: "Knock (Bridge Loan)", type: "ibuyer", website: "https://www.knock.com/markets", buyBox: "HOUSES — bridge 'Home Swap' lender, ~75 markets", notes: "NOT a direct buyer — lender enabling buy-before-sell. Keep on file for creative exits where OUR buyer needs bridge financing. Not for land." },
      { name: "Flyhomes (iBuyer/Brokerage)", type: "ibuyer", website: "https://flyhomes.com/", buyBox: "HOUSES — cash-offer brokerage + buy-before-sell, West-coast heavy", notes: "Cash-offer program via brokerage. Edge case channel for retail-grade house deals. Not for land." },
    ];
    let created = 0, existed = 0;
    for (const b of SEED) {
      const dup = await db.marketContact.findFirst({ where: { name: b.name } });
      if (dup) { existed++; continue; }
      await db.marketContact.create({ data: {
        name: b.name, type: b.type, category: "distressed", vetStage: "active", status: b.type === "jv_partner" ? "JV Partner" : "iBuyer",
        website: b.website, phone: (b as { phone?: string }).phone ?? "", email: (b as { email?: string }).email ?? "",
        buyBox: b.buyBox, notes: b.notes, market: "Nationwide",
      } });
      created++;
    }
    return NextResponse.json({ ok: true, created, existed });
  }

  // 💳 Full subscription audit (?subsaudit=1): every software/dues P&L line
  // from the last few months, grouped by label with the latest actuals.
  if (url.searchParams.get("subsaudit") === "1") {
    const months = [...new Set((await db.expenseLine.findMany({ select: { month: true }, orderBy: { month: "desc" }, take: 500 })).map((r) => r.month))].slice(0, 4);
    const rows = await db.expenseLine.findMany({ where: { month: { in: months }, category: { in: ["software", "dues", "controllable"] } }, orderBy: [{ month: "desc" }] });
    const byLabel: Record<string, { months: Record<string, number>; latest: number }> = {};
    for (const r of rows) {
      const k = r.label.trim();
      byLabel[k] = byLabel[k] ?? { months: {}, latest: 0 };
      byLabel[k].months[r.month] = r.actual;
      if (!byLabel[k].latest) byLabel[k].latest = r.actual;
    }
    return NextResponse.json({ ok: true, monthsCovered: months, subs: byLabel });
  }

  // 📝 PandaDoc event log (?pdlog=1): the last pandadoc timeline rows —
  // shows exactly why a draft button "did nothing".
  if (url.searchParams.get("pdlog") === "1") {
    const events = await db.crmEvent.findMany({ where: { actor: "pandadoc" }, orderBy: { at: "desc" }, take: 10, select: { body: true, at: true } });
    return NextResponse.json({ ok: true, count: events.length, events: events.map((e) => ({ at: e.at.toISOString(), body: e.body.slice(0, 220) })) });
  }

  // 💵 Subscription report (?subsreport=1): what the P&L says we pay the
  // providers we're cutting Nov 7 (Twilio + GHL/REI Reply).
  if (url.searchParams.get("subsreport") === "1") {
    const rows = await db.expenseLine.findMany({ orderBy: [{ month: "desc" }], take: 600 });
    const match = rows.filter((r) => /twilio|rei\s*reply|gohighlevel|go\s*high|ghl/i.test(`${r.label} ${r.note}`));
    return NextResponse.json({ ok: true, found: match.length, rows: match.map((r) => ({ month: r.month, label: r.label, actual: r.actual, projected: r.projected })) });
  }

  // 📍 Address backfill (?ghladdrfix=1): GHL-imported contacts came over with
  // no property address — pull address1/city/state/zip from GHL per contact
  // (time-budgeted; run repeatedly until remaining=0).
  if (url.searchParams.get("ghladdrfix") === "1") {
    const { ghlGet } = await import("@/lib/reireply");
    const deadline = Date.now() + 45_000;
    const todo = await db.crmContact.findMany({ where: { address: "", ghlId: { not: "" } }, select: { id: true, ghlId: true }, take: 400 });
    let updated = 0, empty = 0, failed = 0;
    for (let i = 0; i < todo.length && Date.now() < deadline; i += 8) {
      const batch = todo.slice(i, i + 8);
      const results = await Promise.all(batch.map(async (c) => {
        const r = await ghlGet(`/contacts/${c.ghlId}`).catch(() => null);
        const ct = (r?.body as { contact?: { address1?: string; city?: string; state?: string; postalCode?: string } } | null)?.contact;
        if (!ct) return { id: c.id, addr: null };
        const addr = [ct.address1, ct.city, ct.state, ct.postalCode].filter(Boolean).join(", ").slice(0, 250);
        return { id: c.id, addr };
      }));
      const markFailed = url.searchParams.get("markfailed") === "1";
      for (const r of results) {
        if (r.addr === null) { failed++; if (markFailed) await db.crmContact.update({ where: { id: r.id }, data: { address: "—" } }).catch(() => {}); continue; }
        if (!r.addr) { empty++; await db.crmContact.update({ where: { id: r.id }, data: { address: "—" } }).catch(() => {}); continue; }
        await db.crmContact.update({ where: { id: r.id }, data: { address: r.addr } }).catch(() => {});
        // mirror onto the lead's title when the title is just the person's name
        const opp = await db.crmOpportunity.findFirst({ where: { contactId: r.id, archivedAt: null }, include: { contact: { select: { name: true } } } });
        if (opp && opp.title.trim().toLowerCase() === opp.contact.name.trim().toLowerCase()) {
          await db.crmOpportunity.update({ where: { id: opp.id }, data: { title: r.addr } }).catch(() => {});
        }
        updated++;
      }
    }
    const remaining = await db.crmContact.count({ where: { address: "", ghlId: { not: "" } } });
    return NextResponse.json({ ok: true, updated, noAddressInGhl: empty, failed, remaining, hint: remaining > 0 ? "run again" : "done — '—' marks contacts with no address in GHL" });
  }

  // 📊 Owner distribution report (?ownerreport=1): who owns what, per pipeline
  // (for diagnosing 'everything shows Nick').
  if (url.searchParams.get("ownerreport") === "1") {
    const rows = await db.crmOpportunity.groupBy({ by: ["pipeline", "assignedTo"], where: { archivedAt: null }, _count: { _all: true } });
    const out: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const pl = r.pipeline || "War Room";
      out[pl] = out[pl] ?? {};
      out[pl][r.assignedTo || "(unassigned)"] = r._count._all;
    }
    return NextResponse.json({ ok: true, byPipeline: out });
  }

  // 🔀 Pipeline streamlining migration (?stagemigrate=1 dry / &commit=1 —
  // Jon approved 2026-10-08): rewrites the three bloated pipeline definitions
  // (AQM 19→11, JrAQ →11, DS Signed 10→7) and walks every lead in a retired
  // stage to its merge target. Archive-safe: archived rows migrate too.
  if (url.searchParams.get("stagemigrate") === "1") {
    const commit = url.searchParams.get("commit") === "1";
    const { ACQ_STAGE_ALIASES, DS_STAGE_ALIASES, ACQ_STAGES, DS_STAGES } = await import("@/lib/stage-aliases");
    const plRow = await db.resource.findFirst({ where: { category: "__crm_pipelines__" } });
    if (!plRow?.description) return NextResponse.json({ ok: false, error: "no pipeline defs" });
    const defs = JSON.parse(plRow.description) as Array<{ name: string; stages: Array<{ key: string; label: string }> }>;
    const isAcq = (n: string) => /AQM|JrAQ/i.test(n);
    const isDs = (n: string) => /Signed/i.test(n) && /DS/i.test(n);
    const moved: Record<string, number> = {};
    for (const def of defs) {
      if (isAcq(def.name)) def.stages = ACQ_STAGES;
      if (isDs(def.name)) def.stages = DS_STAGES;
    }
    for (const [from, to] of Object.entries(ACQ_STAGE_ALIASES)) {
      const n = commit
        ? (await db.crmOpportunity.updateMany({ where: { stage: from, pipeline: { contains: "AQ" } }, data: { stage: to } })).count
        : await db.crmOpportunity.count({ where: { stage: from, pipeline: { contains: "AQ" } } });
      if (n) moved[`acq:${from}→${to}`] = n;
    }
    // tag reduction-needed leads BEFORE the stage move erases the signal
    const reductions = await db.crmOpportunity.findMany({ where: { stage: "reduction_needed" }, select: { id: true, tags: true } });
    if (commit) for (const r of reductions) await db.crmOpportunity.update({ where: { id: r.id }, data: { tags: r.tags ? `${r.tags},reduction-needed` : "reduction-needed" } });
    for (const [from, to] of Object.entries(DS_STAGE_ALIASES)) {
      const n = commit
        ? (await db.crmOpportunity.updateMany({ where: { stage: from, pipeline: { contains: "Signed" } }, data: { stage: to } })).count
        : await db.crmOpportunity.count({ where: { stage: from, pipeline: { contains: "Signed" } } });
      if (n) moved[`ds:${from}→${to}`] = n;
    }
    if (commit) await db.resource.update({ where: { id: plRow.id }, data: { description: JSON.stringify(defs) } });
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", moved, newDefs: defs.map((d) => ({ name: d.name, stages: d.stages.length })) });
  }

  // 🧹 One-time Direct REI flood rollback (?dreicleanup=1, Jon 2026-10-08):
  // closes the auto-created "first call" tasks and archives the untouched
  // auto-imported seller opps (archive, never delete — contacts stay). The
  // automation itself now only fires on sellers who REPLY.
  if (url.searchParams.get("dreicleanup") === "1") {
    const tasks = await db.crmTask.findMany({ where: { title: "📞 First call — new Direct REI seller lead", doneAt: null }, select: { id: true, oppId: true } });
    let archived = 0;
    for (const t of tasks) {
      await db.crmTask.update({ where: { id: t.id }, data: { doneAt: new Date() } });
      if (t.oppId) {
        const opp = await db.crmOpportunity.findUnique({ where: { id: t.oppId }, select: { id: true, stage: true, archivedAt: true } });
        if (opp && !opp.archivedAt && opp.stage === "new") {
          const touched = await db.crmEvent.count({ where: { oppId: opp.id, NOT: { actor: "automation" } } });
          if (touched === 0) { await db.crmOpportunity.update({ where: { id: opp.id }, data: { archivedAt: new Date() } }); archived++; }
        }
      }
    }
    return NextResponse.json({ ok: true, tasksClosed: tasks.length, oppsArchived: archived });
  }

  // ✅ Owner to-do (?jontask=1&title=...): drops a task on Jon's list under the
  // 🛠 War Room updates section — used so action items never live only in chat.
  // &biz=1 = a BUSINESS task → also mirrored to Jon's Cortana app. Without it
  // (war-room build work) the task stays in the War Room only (Jon 2026-10-08).
  if (url.searchParams.get("jontask") === "1") {
    const title = (url.searchParams.get("title") ?? "").slice(0, 200);
    if (!title) return NextResponse.json({ ok: false, error: "title required" });
    const jon = await db.user.findFirst({ where: { active: true, name: { startsWith: "Jon", mode: "insensitive" } }, select: { name: true } });
    const dup = await db.crmTask.findFirst({ where: { title: `🛠 ${title}`, doneAt: null } });
    if (dup) return NextResponse.json({ ok: true, existed: true });
    await db.crmTask.create({ data: { oppId: "", contactId: "", title: `🛠 ${title}`, due: new Date().toISOString().slice(0, 10), assignedTo: jon?.name ?? "Jon Cruz", createdBy: "warroom-updates" } });
    // mirror into Jon's Cortana app (Supabase tasks table) ONLY for business
    // tasks (&biz=1) when the bridge key is set: CORTANA_SERVICE_KEY in Vercel
    // (service_role of project tcfsjfymkxlxvzeljwoj). Business area, Q2, pre-triaged.
    let cortana = url.searchParams.get("biz") === "1" ? "skipped (no CORTANA_SERVICE_KEY)" : "skipped (war-room build task — stays in War Room)";
    if (process.env.CORTANA_SERVICE_KEY && url.searchParams.get("biz") === "1") {
      try {
        const cUrl = process.env.CORTANA_SUPABASE_URL || "https://tcfsjfymkxlxvzeljwoj.supabase.co";
        const H = { apikey: process.env.CORTANA_SERVICE_KEY, Authorization: `Bearer ${process.env.CORTANA_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" };
        const ures = await fetch(`${cUrl}/auth/v1/admin/users?per_page=1`, { headers: H }).then((r) => r.json()).catch(() => null);
        const uid = (ures as { users?: Array<{ id: string }> } | null)?.users?.[0]?.id;
        if (uid) {
          const r = await fetch(`${cUrl}/rest/v1/tasks`, {
            method: "POST", headers: H,
            body: JSON.stringify({ user_id: uid, title: `🛠 ${title}`, area: "business", quadrant: "q2", due_date: new Date().toISOString().slice(0, 10), notes: "War Room update — created automatically by Claude.", triaged: true }),
          });
          cortana = r.ok ? "mirrored" : `failed ${r.status}`;
        } else cortana = "no cortana user found";
      } catch (e) { cortana = `error ${String(e).slice(0, 60)}`; }
    }
    return NextResponse.json({ ok: true, cortana });
  }

  // 👤 Owner repair (?ghlownerfix=1 dry / &commit=1): re-read every imported
  // lead's TRUE owner from GHL and fix assignedTo ONLY — stages/pipelines the
  // team already moved in the War Room are left alone. Fixes the
  // Enrico-owns-everything import bug (startsWith("") matched the first user).
  if (url.searchParams.get("ghlownerfix") === "1") {
    const commit = url.searchParams.get("commit") === "1";
    const { searchOpportunities, getPipelines, listCrmUsers } = await import("@/lib/reireply");
    const { AGENTS } = await import("@/lib/crm-sync");
    const APPROVED = [/signed/i, /sell\s*land/i, /jon\s*&\s*mitch/i, /jraq.*nick|nick/i];
    const pls = await getPipelines();
    const plBody = pls.body as { pipelines?: Array<{ id: string; name: string }> };
    const pipelines = (plBody.pipelines ?? []).filter((p) => APPROVED.some((rx) => rx.test(p.name)));
    const repByCrm = new Map(AGENTS.map((a) => [a.crm, a.first]));
    const users = await db.user.findMany({ where: { active: true }, select: { name: true } });
    const fullName = (first: string) => (first ? users.find((u) => u.name.toLowerCase().startsWith(first))?.name ?? "" : "");
    const ghlUsers = await listCrmUsers().catch(() => ({ users: [] as Array<{ id: string; name: string }> }));
    const ghlName = new Map(ghlUsers.users.map((u) => [u.id, u.name]));
    const resolveOwner = (ghlUserId: string, pipeName: string) => {
      const mapped = fullName(repByCrm.get(ghlUserId) ?? "");
      if (mapped) return mapped;
      const gname = ghlName.get(ghlUserId) ?? "";
      if (gname) {
        const local = fullName(gname.trim().split(/\s+/)[0].toLowerCase());
        return local || gname;
      }
      return /nick/i.test(pipeName) ? (fullName("nicholas") || fullName("nick") || "Nicholas Fair") : "";
    };
    let checked = 0, fixed = 0;
    const byOwner: Record<string, number> = {};
    const changes: string[] = [];
    for (const p of pipelines) {
      const opps = await fetchAllOpps(searchOpportunities, p.id);
      for (const o of opps) {
        const ghlOppId = String(o.id ?? "");
        if (!ghlOppId) continue;
        const rep = resolveOwner(String(o.assignedTo ?? ""), p.name);
        byOwner[rep || "(unassigned)"] = (byOwner[rep || "(unassigned)"] ?? 0) + 1;
        const local = await db.crmOpportunity.findFirst({ where: { ghlId: ghlOppId }, select: { id: true, assignedTo: true, contactId: true, title: true } });
        if (!local) continue;
        checked++;
        if (local.assignedTo === rep) continue;
        if (changes.length < 30) changes.push(`${local.title.slice(0, 30)}: ${local.assignedTo || "—"} → ${rep || "—"}`);
        if (commit) {
          await db.crmOpportunity.update({ where: { id: local.id }, data: { assignedTo: rep } });
          await db.crmContact.update({ where: { id: local.contactId }, data: { assignedTo: rep } }).catch(() => {});
        }
        fixed++;
      }
    }
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", checked, wouldFix: fixed, ownersFromGhl: byOwner, sampleChanges: changes, ghlUsersFound: ghlUsers.users.length });
  }

  // 📞 Number inventory: Direct REI lines stay put; UNASSIGNED numbers get
  // claimed for the War Room CRM (?claimnumbers=1 dry / &commit=1).
  if (url.searchParams.get("claimnumbers") === "1") {
    const key = process.env.TELNYX_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "no TELNYX_API_KEY" });
    const commit = url.searchParams.get("commit") === "1";
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    let cfg: { connId?: string; ccAppId?: string } = {};
    try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    if (!cfg.ccAppId) return NextResponse.json({ ok: false, error: "run ?inboundsetup2=1 first" });
    const res = await fetch("https://api.telnyx.com/v2/phone_numbers?page[size]=250", { headers: { Authorization: `Bearer ${key}` } });
    const body = (await res.json()) as { data?: Array<{ id?: string; phone_number?: string; connection_id?: string; connection_name?: string }> };
    const ours = new Set([cfg.connId, cfg.ccAppId].filter(Boolean));
    const report = { warRoom: [] as string[], directRei: [] as string[], claimed: [] as string[], wouldClaim: [] as string[] };
    for (const n of body.data ?? []) {
      const conn = String(n.connection_id ?? "");
      const num = n.phone_number ?? "";
      if (!num) continue;
      if (ours.has(conn)) { report.warRoom.push(num); continue; }
      if (conn) { report.directRei.push(`${num} (${n.connection_name ?? conn})`); continue; }
      if (commit && n.id) {
        const r = await fetch(`https://api.telnyx.com/v2/phone_numbers/${n.id}`, { method: "PATCH", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ connection_id: cfg.ccAppId }) });
        if (r.ok) report.claimed.push(num); else report.wouldClaim.push(`${num} (claim failed ${r.status})`);
      } else report.wouldClaim.push(num);
    }
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", ...report });
  }

  // 🔎 Inbound diagnostics: number status/capabilities + the last webhook
  // events Telnyx actually sent us (so "it didn't ring" becomes explainable).
  if (url.searchParams.get("inbounddiag") === "1") {
    const key = process.env.TELNYX_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "no TELNYX_API_KEY" });
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    let cfg: { connId?: string; callerId?: string } = {};
    try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    const num = process.env.TELNYX_CALLER_ID || cfg.callerId || "";
    const nres = await fetch(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(num)}`, { headers: { Authorization: `Bearer ${key}` } });
    const nb = (await nres.json()) as { data?: Array<Record<string, unknown>> };
    const pn = nb.data?.[0] ?? null;
    const evRow = await db.resource.findFirst({ where: { category: "__telnyx_events__" } });
    let events: unknown[] = [];
    try { events = evRow?.description ? JSON.parse(evRow.description) : []; } catch { /* none */ }
    // What is the Call Control app actually configured to do?
    const cfg2 = cfg as { ccAppId?: string };
    let ccApp: unknown = null;
    if (cfg2.ccAppId) {
      const ares = await fetch(`https://api.telnyx.com/v2/call_control_applications/${cfg2.ccAppId}`, { headers: { Authorization: `Bearer ${key}` } });
      const ab = (await ares.json()) as { data?: Record<string, unknown> };
      const a = ab.data;
      ccApp = a ? { name: a.application_name, webhook: a.webhook_event_url, active: a.active, api_version: a.webhook_api_version } : `lookup failed ${ares.status}`;
    }
    return NextResponse.json({
      ok: true, number: num,
      numberInfo: pn ? { status: pn.status, connection_id: pn.connection_id, connection_name: pn.connection_name, messaging_profile_id: pn.messaging_profile_id ?? null, emergency: undefined } : "NOT FOUND",
      webrtcConnection: cfg.connId ?? null,
      callControlApp: ccApp,
      recentWebhookEvents: events,
      hint: "Call the number with /crm open (hard refresh first), then run this again — the events list shows exactly what Telnyx did.",
    });
  }

  // 💬 SMS setup: create a "War Room SMS" messaging profile and attach every
  // War-Room-connection number to it (text-back + CRM texting need this —
  // numbers moved from Direct REI arrive with no messaging profile).
  // ?smssetup=1 dry-run / &commit=1 applies.
  if (url.searchParams.get("smssetup") === "1") {
    const key = process.env.TELNYX_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "no TELNYX_API_KEY" });
    const commit = url.searchParams.get("commit") === "1";
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    let cfg: { connId?: string; ccAppId?: string; msgProfileId?: string } = {};
    try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    if (!cfg.ccAppId) return NextResponse.json({ ok: false, error: "run ?inboundsetup2=1 first" });
    const tx = async (path: string, init?: RequestInit) => {
      const res = await fetch(`https://api.telnyx.com/v2${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
      const text = await res.text();
      let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
      return { ok: res.ok, status: res.status, body, text };
    };
    const steps: string[] = [];
    // 1. ensure the profile exists
    if (!cfg.msgProfileId) {
      const list = await tx("/messaging_profiles?page[size]=50");
      const lb = list.body as { data?: Array<{ id?: string; name?: string }> };
      const existing = lb.data?.find((p) => p.name === "War Room SMS");
      if (existing?.id) { cfg.msgProfileId = existing.id; steps.push("profile exists"); }
      else if (commit) {
        const mk = await tx("/messaging_profiles", { method: "POST", body: JSON.stringify({ name: "War Room SMS", enabled: true, whitelisted_destinations: ["US"] }) });
        const mb = mk.body as { data?: { id?: string } };
        if (!mk.ok || !mb.data?.id) return NextResponse.json({ ok: false, error: `profile create refused (${mk.status}): ${mk.text.slice(0, 180)}`, steps });
        cfg.msgProfileId = mb.data.id; steps.push("profile created");
      } else steps.push("would create profile 'War Room SMS'");
    } else steps.push("profile known");
    // 2. attach every number on our connections that lacks it
    const nums = await tx("/phone_numbers?page[size]=250");
    const nb = nums.body as { data?: Array<{ id?: string; phone_number?: string; connection_id?: string; messaging_profile_id?: string | null }> };
    const ours = new Set([cfg.connId, cfg.ccAppId].filter(Boolean));
    const report = { attached: [] as string[], already: [] as string[], wouldAttach: [] as string[], campaignNote: "US A2P SMS needs the number on a 10DLC campaign — check Telnyx → Messaging → 10DLC after attaching; texts may be carrier-blocked until then." };
    for (const n of nb.data ?? []) {
      if (!ours.has(String(n.connection_id ?? ""))) continue;
      const num = n.phone_number ?? ""; if (!num || !n.id) continue;
      if (n.messaging_profile_id && n.messaging_profile_id === cfg.msgProfileId) { report.already.push(num); continue; }
      if (commit && cfg.msgProfileId) {
        const r = await tx(`/phone_numbers/${n.id}/messaging`, { method: "PATCH", body: JSON.stringify({ messaging_profile_id: cfg.msgProfileId }) });
        if (r.ok) report.attached.push(num); else report.wouldAttach.push(`${num} (failed ${r.status}: ${r.text.slice(0, 120)})`);
      } else report.wouldAttach.push(num);
    }
    await db.resource.update({ where: { id: row!.id }, data: { description: JSON.stringify(cfg) } });
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", profileId: cfg.msgProfileId ?? null, steps, ...report });
  }

  // ☎️ Inbound v2 (the "call cannot be completed" fix): a Call Control app
  // owns the number; our webhook answers and TRANSFERS to the WebRTC
  // credential's SIP address — deterministic routing, missed-call text-back
  // when the browser doesn't pick up. ?inboundsetup2=1
  if (url.searchParams.get("inboundsetup2") === "1") {
    const key = process.env.TELNYX_API_KEY;
    if (!key) return NextResponse.json({ ok: false, error: "no TELNYX_API_KEY" });
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    let cfg: { connId?: string; credId?: string; callerId?: string; ccAppId?: string; sipUser?: string } = {};
    try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    if (!cfg.connId) return NextResponse.json({ ok: false, error: "run ?telnyxprobe=1 first" });
    const tx = async (path: string, init?: RequestInit) => {
      const res = await fetch(`https://api.telnyx.com/v2${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
      const text = await res.text();
      let body: unknown; try { body = JSON.parse(text); } catch { body = text; }
      return { ok: res.ok, status: res.status, body, text };
    };
    const steps: string[] = [];
    // the credential's SIP username (we didn't store it at creation)
    if (!cfg.sipUser) {
      const cc = await tx(`/credential_connections/${cfg.connId}`);
      const cb = cc.body as { data?: { user_name?: string } };
      cfg.sipUser = cb.data?.user_name ?? "";
      steps.push(cfg.sipUser ? `sip user: ${cfg.sipUser}` : `sip user lookup failed ${cc.status}`);
    }
    if (!cfg.ccAppId) {
      const app = await tx("/call_control_applications", { method: "POST", body: JSON.stringify({ application_name: "War Room Inbound", webhook_event_url: "https://kpi-tracker-lovat.vercel.app/api/telnyx/call" }) });
      const ab = app.body as { data?: { id?: string } };
      if (!app.ok || !ab.data?.id) return NextResponse.json({ ok: false, error: `call control app refused (${app.status}): ${app.text.slice(0, 180)}`, steps });
      cfg.ccAppId = ab.data.id;
      steps.push("call control app created");
    } else steps.push("call control app exists");
    const num = process.env.TELNYX_CALLER_ID || cfg.callerId || "";
    const look = await tx(`/phone_numbers?filter[phone_number]=${encodeURIComponent(num)}`);
    const lb = look.body as { data?: Array<{ id?: string }> };
    const pn = lb.data?.[0];
    if (!pn?.id) return NextResponse.json({ ok: false, error: `number ${num} not found`, steps });
    const assign = await tx(`/phone_numbers/${pn.id}`, { method: "PATCH", body: JSON.stringify({ connection_id: cfg.ccAppId }) });
    steps.push(assign.ok ? `number ${num} → call control app` : `assign failed ${assign.status}: ${assign.text.slice(0, 160)}`);
    const description = JSON.stringify(cfg);
    await db.resource.update({ where: { id: row!.id }, data: { description } });
    return NextResponse.json({ ok: assign.ok && !!cfg.sipUser, steps, inboundNumber: num, sipUser: cfg.sipUser });
  }

  // ☎️ Inbound setup: point TELNYX_CALLER_ID at the WebRTC credential
  // connection (so browsers ring) + aim its webhooks at /api/telnyx/call
  // (so missed calls trigger the text-back). Idempotent.
  if (url.searchParams.get("inboundsetup") === "1") {
    const key = process.env.TELNYX_API_KEY;
    const row = await db.resource.findFirst({ where: { category: "__telnyx_webrtc__" } });
    let cfg: { connId?: string; callerId?: string } = {};
    try { cfg = row?.description ? JSON.parse(row.description) : {}; } catch { /* none */ }
    const num = process.env.TELNYX_CALLER_ID || cfg.callerId;
    if (!key || !num) return NextResponse.json({ ok: false, error: "TELNYX_API_KEY missing or no caller number known" });
    if (!cfg.connId) return NextResponse.json({ ok: false, error: "WebRTC not provisioned yet — run ?telnyxprobe=1 first" });
    const tx = async (path: string, init?: RequestInit) => {
      const res = await fetch(`https://api.telnyx.com/v2${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
      return { ok: res.ok, status: res.status, text: (await res.text()).slice(0, 300) };
    };
    // find the number's id
    const look = await fetch(`https://api.telnyx.com/v2/phone_numbers?filter[phone_number]=${encodeURIComponent(num)}`, { headers: { Authorization: `Bearer ${key}` } });
    const lb = (await look.json()) as { data?: Array<{ id?: string; connection_id?: string }> };
    const pn = lb.data?.[0];
    if (!pn?.id) return NextResponse.json({ ok: false, error: `number ${num} not found on this Telnyx account` });
    const steps: string[] = [`number found (was connection ${pn.connection_id ?? "none"})`];
    const assign = await tx(`/phone_numbers/${pn.id}`, { method: "PATCH", body: JSON.stringify({ connection_id: cfg.connId }) });
    steps.push(assign.ok ? "number → WebRTC connection (browsers will ring)" : `assign failed ${assign.status}: ${assign.text}`);
    const hook = await tx(`/credential_connections/${cfg.connId}`, { method: "PATCH", body: JSON.stringify({ webhook_event_url: "https://kpi-tracker-lovat.vercel.app/api/telnyx/call" }) });
    steps.push(hook.ok ? "webhooks → /api/telnyx/call (missed-call text-back armed)" : `webhook failed ${hook.status}: ${hook.text}`);
    return NextResponse.json({ ok: assign.ok && hook.ok, steps, inboundNumber: num });
  }

  // 🧪 Telnyx browser-dialer probe: provisioning + token mint, headless.
  if (url.searchParams.get("telnyxprobe") === "1") {
    const { provisionAndToken } = await import("@/lib/telnyx-webrtc");
    const r = await provisionAndToken();
    return NextResponse.json({ ok: !r.error, steps: r.steps, callerId: r.callerId ?? null, tokenMinted: !!r.token, error: r.error ?? null });
  }

  // 🧪 CRM self-test: run every query the CRM pages run, report pass/fail.
  if (url.searchParams.get("crmselftest") === "1") {
    const out: Record<string, string> = {};
    const t = async (name: string, fn: () => Promise<unknown>) => {
      try { const v = await fn(); out[name] = `✅ ${typeof v === "number" ? v : Array.isArray(v) ? v.length : "ok"}`; }
      catch (e) { out[name] = `❌ ${String(e).slice(0, 160)}`; }
    };
    const { readPipelines } = await import("@/lib/crm");
    const { readSnippets, readSequences, readSeqState } = await import("@/lib/crm-templates");
    await t("pipelines", async () => (await readPipelines()).length);
    await t("groupBy", async () => (await db.crmOpportunity.groupBy({ by: ["stage"], where: { archivedAt: null, pipeline: "🔥 AQM: Jon & Mitch" }, _count: { _all: true }, _sum: { value: true } })).length);
    await t("boardCols", async () => (await db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: ["", "War Room"] }, stage: "new" }, include: { contact: { select: { name: true, phone: true } } }, take: 5 })).length);
    await t("oppCard", async () => {
      const o = await db.crmOpportunity.findFirst({ where: { archivedAt: null }, include: { contact: true } });
      if (!o) return 0;
      await db.crmEvent.findMany({ where: { contactId: o.contactId }, orderBy: { at: "desc" }, take: 5 });
      await db.crmParty.findMany({ where: { oppId: o.id } });
      return 1;
    });
    await t("dialerQueue", async () => (await db.crmOpportunity.findMany({ where: { archivedAt: null, nextFollowUp: { not: "", lte: new Date().toISOString().slice(0, 10) } }, include: { contact: true }, take: 5 })).length);
    await t("tasks", async () => db.crmTask.count());
    await t("appts", async () => db.crmAppointment.count());
    await t("snippets", async () => (await readSnippets()).length);
    await t("sequences", async () => (await readSequences()).length);
    await t("seqState", async () => Object.keys(await readSeqState()).length);
    await t("counts", async () => db.crmOpportunity.count({ where: { archivedAt: null } }));
    return NextResponse.json({ ok: !Object.values(out).some((v) => v.startsWith("❌")), checks: out });
  }

  // 🔀 Sync the 4 approved GHL pipelines (names + exact stage order) into the
  // CRM's pipeline definitions — the board renders THESE columns per pipeline.
  if (url.searchParams.get("ghlpipesync") === "1") {
    const { getPipelines } = await import("@/lib/reireply");
    const { writeGhlPipelines, stageSlug } = await import("@/lib/crm");
    const APPROVED = [/signed/i, /sell\s*land/i, /jon\s*&\s*mitch/i, /jraq.*nick|nick/i];
    const pls = await getPipelines();
    const plBody = pls.body as { pipelines?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }> };
    const list = (plBody.pipelines ?? []).filter((p) => APPROVED.some((rx) => rx.test(p.name)))
      .map((p) => ({ name: p.name, stages: (p.stages ?? []).map((st) => ({ key: stageSlug(st.name), label: st.name })) }));
    await writeGhlPipelines(list);
    return NextResponse.json({ ok: true, pipelines: list.map((p) => ({ name: p.name, stages: p.stages.length })) });
  }

  // Paginated GHL opportunity fetch — the 100-row cap was silently dropping
  // leads (DS: Signed looked wrong, AQM/JrAQ pinned at exactly 100).
  async function fetchAllOpps(searchOpportunities: (pid: string, extra?: Record<string, string>) => Promise<{ ok: boolean; body: unknown }>, pid: string): Promise<Array<Record<string, unknown>>> {
    const all: Array<Record<string, unknown>> = [];
    for (let page = 1; page <= 10; page++) {
      const res = await searchOpportunities(pid, { page: String(page) });
      if (!res.ok) break;
      const body = res.body as { opportunities?: Array<Record<string, unknown>>; meta?: { nextPage?: number | null } };
      const batch = body.opportunities ?? [];
      all.push(...batch);
      if (batch.length < 100 || body.meta?.nextPage == null && batch.length < 100) break;
      if (batch.length < 100) break;
    }
    return all;
  }

  // GHL → Seller CRM import v2 (Jon 2026-10-07: ONLY DS: Signed, DS: Sell
  // Land, AQM Jon & Mitch, JrAQ: Nick — per respective user, GHL-like stages).
  // ?ghlimport=1 dry / &commit=1. Idempotent: existing opps UPDATE stage/rep;
  // previously-imported opps from non-approved pipelines get archived.
  if (url.searchParams.get("ghlimport") === "1") {
    const commit = url.searchParams.get("commit") === "1";
    const { searchOpportunities, ghlGet, getPipelines } = await import("@/lib/reireply");
    const { AGENTS } = await import("@/lib/crm-sync");
    const { logCrmEvent } = await import("@/lib/crm");
    const APPROVED = [/signed/i, /sell\s*land/i, /jon\s*&\s*mitch/i, /jraq.*nick|nick/i];
    const pls = await getPipelines();
    const plBody = pls.body as { pipelines?: Array<{ id: string; name: string; stages?: Array<{ id: string; name: string }> }> };
    let pipelines = (plBody.pipelines ?? []).filter((p) => APPROVED.some((rx) => rx.test(p.name)));
    const pipeIdx = url.searchParams.get("pipe");
    if (pipeIdx != null) pipelines = pipelines.filter((_, i) => i === Number(pipeIdx));
    const stageName = new Map<string, string>();
    for (const p of plBody.pipelines ?? []) for (const st of p.stages ?? []) stageName.set(st.id, st.name);
    // GHL parity: keep the EXACT pipeline + stage (slug of GHL's stage name),
    // then run the streamlining aliases so a re-import can't resurrect retired
    // stages (Jon's 2026-10-08 pipeline merge).
    const { stageSlug } = await import("@/lib/crm");
    const { ACQ_STAGE_ALIASES: acqAlias, DS_STAGE_ALIASES: dsAlias } = await import("@/lib/stage-aliases");
    const mapStage = (n: string, pipeName: string) => {
      const slug = n ? stageSlug(n) : "contacted";
      if (/AQ/i.test(pipeName) && acqAlias[slug]) return acqAlias[slug];
      if (/Signed/i.test(pipeName) && dsAlias[slug]) return dsAlias[slug];
      return slug;
    };
    const repByCrm = new Map(AGENTS.map((a) => [a.crm, a.first]));
    const users = await db.user.findMany({ where: { active: true }, select: { name: true } });
    // BUG FIX (Enrico-owns-everything): startsWith("") matches EVERYONE, so an
    // unmapped GHL owner used to resolve to whatever user came first in the
    // table. Guard the empty lookup and fall back to GHL's own user directory.
    const fullName = (first: string) => (first ? users.find((u) => u.name.toLowerCase().startsWith(first))?.name ?? "" : "");
    const { listCrmUsers } = await import("@/lib/reireply");
    const ghlUsers = await listCrmUsers().catch(() => ({ users: [] as Array<{ id: string; name: string }> }));
    const ghlName = new Map(ghlUsers.users.map((u) => [u.id, u.name]));
    const resolveOwner = (ghlUserId: string, pipeName: string) => {
      const mapped = fullName(repByCrm.get(ghlUserId) ?? "");
      if (mapped) return mapped;
      const gname = ghlName.get(ghlUserId) ?? "";
      if (gname) {
        const local = fullName(gname.trim().split(/\s+/)[0].toLowerCase());
        return local || gname; // show the real GHL owner even without a War Room account
      }
      return /nick/i.test(pipeName) ? (fullName("nicholas") || fullName("nick") || "Nicholas Fair") : "";
    };
    type Row = { ghlOppId: string; ghlContactId: string; name: string; phone: string; email: string; title: string; value: number | null; rep: string; stage: string; pipeline: string; closedAt: string };
    const rows: Row[] = [];
    for (const p of pipelines) {
      const opps = await fetchAllOpps(searchOpportunities, p.id);
      for (const o of opps) {
        const status = String(o.status ?? "");
        // Signed pipeline also pulls won/lost (Jon 2026-10-08): DEAL WON +
        // DEAL DIED are the company's money history. Other pipelines: open only.
        if (status !== "open" && !(/signed/i.test(p.name) && ["won", "lost", "abandoned"].includes(status))) continue;
        const contact = (o.contact ?? {}) as { id?: string; name?: string; phone?: string; email?: string };
        const ghlStage = stageName.get(String(o.pipelineStageId ?? "")) ?? "";
        // "respective user": GHL owner wins; JrAQ: Nick pipeline defaults to Nicholas
        const rep = resolveOwner(String(o.assignedTo ?? ""), p.name);
        rows.push({
          ghlOppId: String(o.id ?? ""), ghlContactId: String(contact.id ?? o.contactId ?? ""),
          name: String(contact.name ?? o.name ?? "—"), phone: String(contact.phone ?? ""), email: String(contact.email ?? ""),
          title: String(o.name ?? contact.name ?? "Imported opportunity"),
          value: o.monetaryValue != null ? Number(o.monetaryValue) : null,
          rep, stage: mapStage(ghlStage, p.name), pipeline: p.name,
          closedAt: ["won", "lost", "abandoned"].includes(status) ? String((o as { updatedAt?: string }).updatedAt ?? "") : "",
        });
      }
    }
    let contacts = 0, opps = 0, notes = 0, updated = 0, archived = 0;
    if (commit) {
      const byGhlContact = new Map<string, string>();
      for (const r of rows) {
        if (!r.ghlOppId) continue;
        let contactId = r.ghlContactId ? byGhlContact.get(r.ghlContactId) : undefined;
        if (!contactId) {
          const existing = r.ghlContactId ? await db.crmContact.findFirst({ where: { ghlId: r.ghlContactId } }) : null;
          if (existing) contactId = existing.id;
          else {
            const created = await db.crmContact.create({ data: { name: r.name, phone: r.phone, email: r.email, source: "GHL import", assignedTo: r.rep, ghlId: r.ghlContactId } });
            contactId = created.id; contacts++;
          }
          if (r.ghlContactId) byGhlContact.set(r.ghlContactId, contactId);
        }
        const dupOpp = await db.crmOpportunity.findFirst({ where: { ghlId: r.ghlOppId } });
        if (dupOpp) {
          const fdPrev = (dupOpp.formData ?? {}) as Record<string, unknown>;
          await db.crmOpportunity.update({ where: { id: dupOpp.id }, data: { pipeline: r.pipeline, stage: r.stage, assignedTo: r.rep || dupOpp.assignedTo, tags: "ghl-import", archivedAt: null, ...(r.value != null && dupOpp.value == null ? { value: r.value } : {}), ...(r.closedAt ? { formData: { ...fdPrev, __closedAt: r.closedAt } } : {}) } });
          updated++;
          continue;
        }
        const opp = await db.crmOpportunity.create({ data: { contactId, title: r.title.slice(0, 160), pipeline: r.pipeline, stage: r.stage, value: r.value, assignedTo: r.rep, ghlId: r.ghlOppId, tags: "ghl-import", ...(r.closedAt ? { formData: { __closedAt: r.closedAt } } : {}) } });
        await logCrmEvent({ contactId, oppId: opp.id, kind: "system", body: `Imported from GHL — ${r.pipeline}`, actor: "ghl-import" });
        opps++;
      }
      // archive earlier imports that came from pipelines Jon excluded
      // (skipped on partial &pipe=N runs — only a full sweep can judge strays)
      if (pipeIdx == null) {
        const keep = new Set(rows.map((r) => r.ghlOppId));
        const stray = await db.crmOpportunity.findMany({ where: { ghlId: { not: "" }, archivedAt: null, tags: { contains: "ghl-import" } }, select: { id: true, ghlId: true } });
        for (const s2 of stray) {
          if (keep.has(s2.ghlId)) continue;
          await db.crmOpportunity.update({ where: { id: s2.id }, data: { archivedAt: new Date(), stage: "nurture" } });
          archived++;
        }
      }
    }
    const perRep: Record<string, number> = {};
    for (const r of rows) perRep[r.rep || "unassigned"] = (perRep[r.rep || "unassigned"] ?? 0) + 1;
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", pipelinesMatched: pipelines.map((p) => p.name), openOpps: rows.length, perRep, contactsCreated: contacts, oppsCreated: opps, oppsUpdated: updated, strayArchived: archived, notesImported: notes, sample: rows.slice(0, 10) });
  }

  // 💰 GHL DEAL WON → the Deals board (Jon 2026-10-07: closed deals with
  // value per lead belong in the deals CRM). ?ghlwonimport=1 dry / &commit=1.
  if (url.searchParams.get("ghlwonimport") === "1") {
    const commit = url.searchParams.get("commit") === "1";
    const { searchOpportunities, getPipelines } = await import("@/lib/reireply");
    const pls = await getPipelines();
    const plBody = pls.body as { pipelines?: Array<{ id: string; name: string }> };
    const rows: Array<{ ghlId: string; name: string; value: number; wonAt: string; pipeline: string }> = [];
    for (const p of plBody.pipelines ?? []) {
      const opps = await fetchAllOpps(searchOpportunities, p.id);
      for (const o of opps) {
        if (String(o.status ?? "") !== "won") continue;
        const raw = (o.lastStatusChangeAt ?? o.updatedAt) as string | number | undefined;
        const ms = typeof raw === "number" ? raw : Date.parse(String(raw ?? 0));
        rows.push({ ghlId: String(o.id ?? ""), name: String(o.name ?? "—"), value: Number(o.monetaryValue ?? 0), wonAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : "", pipeline: p.name });
      }
    }
    let created = 0;
    if (commit) {
      for (const r of rows) {
        const marker = `ghl:${r.ghlId}`;
        const dup = await db.deal.findFirst({ where: { source: marker }, select: { id: true } });
        if (dup) continue;
        await db.deal.create({ data: {
          address: `${r.name} (GHL won)`.slice(0, 160), status: "closed", active: true,
          soldPrice: r.value || null, assignmentFee: r.value || null, soldDate: r.wonAt,
          source: marker, notes: `Imported from GoHighLevel — DEAL WON in "${r.pipeline}"${r.value ? ` · $${r.value.toLocaleString()}` : ""}`,
        } });
        created++;
      }
    }
    return NextResponse.json({ ok: true, mode: commit ? "COMMITTED" : "DRY RUN", won: rows.length, totalValue: rows.reduce((a, b) => a + b.value, 0), created, rows: rows.slice(0, 20) });
  }

  // Read-only: GHL WON opportunities with the credited rep + value (Jon
  // 2026-10-07: see how much profit each rep has generated). ?ghlwon=1
  if (url.searchParams.get("ghlwon") === "1") {
    const { searchOpportunities } = await import("@/lib/reireply");
    const { AGENTS } = await import("@/lib/crm-sync");
    const PIPELINES = ["KkdpJx35dU4cLtYY9vXP", "8R4HDQD1nUGOUxGCxuCe", "Jm90sKZNvl8e5fKparhv"];
    const repByCrm = new Map(AGENTS.map((a) => [a.crm, a.first]));
    const rows: Array<{ name: string; value: number; rep: string; wonAt: string; pipeline: string }> = [];
    for (const pid of PIPELINES) {
      const res = await searchOpportunities(pid);
      if (!res.ok) continue;
      const body = res.body as { opportunities?: Array<Record<string, unknown>> };
      for (const o of body.opportunities ?? []) {
        if (String(o.status ?? "") !== "won") continue;
        const raw = (o.lastStatusChangeAt ?? o.lastStageChangeAt ?? o.updatedAt) as string | number | undefined;
        const ms = typeof raw === "number" ? raw : Date.parse(String(raw ?? 0));
        rows.push({
          name: String(o.name ?? "—"),
          value: Number(o.monetaryValue ?? 0),
          rep: repByCrm.get(String(o.assignedTo ?? "")) ?? String(o.assignedTo ?? "unassigned"),
          wonAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : "",
          pipeline: pid.slice(0, 6),
        });
      }
    }
    rows.sort((a, b) => b.value - a.value);
    const perRep: Record<string, { deals: number; value: number }> = {};
    for (const r of rows) { const p = (perRep[r.rep] ??= { deals: 0, value: 0 }); p.deals++; p.value += r.value; }
    return NextResponse.json({ ok: true, won: rows.length, totalValue: rows.reduce((a, r) => a + r.value, 0), perRep, rows });
  }

  // Scorecard order + merge (Jon 2026-10-07): Signed Contract lands after
  // Offers Rejected; Quality Conversations retires into Completed Process
  // Calls (one human milestone — simpler for the team).
  if (url.searchParams.get("kpiorder") === "1") {
    const ORDER: Record<string, number> = {
      leads_generated: 10, outbound_calls: 20, connected_calls: 30, completed_process_calls: 40,
      leads_worked: 50, acq_talk_time: 60, offers_made: 70, acq_contracts_sent: 80,
      offers_rejected: 90, acq_signed: 100,
    };
    const out: string[] = [];
    for (const [key, sortOrder] of Object.entries(ORDER)) {
      const k = await db.kpi.findFirst({ where: { key } });
      if (k) { await db.kpi.update({ where: { id: k.id }, data: { sortOrder } }); out.push(`${k.name} → ${sortOrder}`); }
    }
    const qc = await db.kpi.findFirst({ where: { key: "quality_convos" } });
    if (qc && qc.active) { await db.kpi.update({ where: { id: qc.id }, data: { active: false } }); out.push("Quality Conversations retired (merged into Process Calls)"); }
    const pc = await db.kpi.findFirst({ where: { key: "completed_process_calls" } });
    if (pc) await db.kpi.update({ where: { id: pc.id }, data: { definition: "Goal 4/day (Nick 3): the FULL discovery call — condition, price they want, timeline — ending ready to underwrite. This IS the quality conversation; next stop is an offer. MANUAL." } });
    return NextResponse.json({ ok: true, done: out });
  }

  // One Signed Contract KPI (Jon 2026-10-07): retire the assignment/novation/
  // creative/listing split — count goes in ONE field, the TYPE goes in a note.
  if (url.searchParams.get("signedmerge") === "1") {
    const out: string[] = [];
    let k = await db.kpi.findFirst({ where: { key: "acq_signed" } });
    if (!k) {
      k = await db.kpi.create({ data: {
        key: "acq_signed", name: "Signed Contract", emoji: "✍️", category: "green", unit: "count",
        scope: "per_rep", roleKey: "acquisitions", cadence: "daily", goalKind: "tracked",
        definition: "How many contracts got SIGNED today — one number. Put the TYPE in the note (assignment / novation / creative / listing) and it shows on the report.",
      } });
      out.push("created Signed Contract (acq_signed)");
    }
    for (const key of ["acq_signed_assignment", "acq_signed_novation", "acq_signed_creative", "acq_signed_listing"]) {
      const old = await db.kpi.findFirst({ where: { key } });
      if (old && old.active) { await db.kpi.update({ where: { id: old.id }, data: { active: false } }); out.push(`${old.name} retired (history kept)`); }
    }
    return NextResponse.json({ ok: true, done: out });
  }

  // Move the phone KPIs (dials/connections/quality convos) onto the
  // ACQUISITIONS scorecard — Michelle & Nick are acquisitions, not cc_lm,
  // so the auto-fed numbers never showed on their pages (Jon 2026-10-07).
  if (url.searchParams.get("kpirolefix") === "1") {
    const out: string[] = [];
    for (const key of ["outbound_calls", "connected_calls", "quality_convos"]) {
      const k = await db.kpi.findFirst({ where: { key } });
      if (k) { await db.kpi.update({ where: { id: k.id }, data: { roleKey: "acquisitions" } }); out.push(`${k.name} → acquisitions`); }
    }
    return NextResponse.json({ ok: true, moved: out });
  }

  // Goal raise round 2 (Jon 2026-10-07): apply offers/contracts floors, stamp
  // the WHY into each KPI's definition, pro-rate Marie & Nick to 5h shifts
  // via standing per-rep Target overrides. Idempotent.
  if (url.searchParams.get("goalraise2") === "1") {
    const out: string[] = [];
    const RAISES: Record<string, number> = { offers_made: 3, acq_contracts_sent: 1 };
    for (const [key, goalValue] of Object.entries(RAISES)) {
      const k = await db.kpi.findFirst({ where: { key } });
      if (k) { await db.kpi.update({ where: { id: k.id }, data: { goalValue, goalKind: "at_least" } }); out.push(`${k.name} → ${goalValue}`); }
    }
    const WHY: Record<string, string> = {
      dev_conversations: "Goal 8/day (Marie 5): real buyer conversations move deals — MANUAL entry; you know a real convo when you have one.",
      buyers_contacted: "Goal 40 dials/day (Marie 25): ~20% connect rate is what produces 8 conversations. AUTO from the phone system.",
      answered_calls: "Goal 12/day (Marie 8): the honest middle metric between dials and conversations. AUTO from the phone system.",
      ds_talk_time: "Goal 90 min/day (Marie 60): 8 real conversations don't fit in less. AUTO from the phone system.",
      deals_sold: "Goal 5 sends/day (Marie 3): the cascade + packet made sending nearly free. MANUAL.",
      buyers_vetted: "Goal 2/day (Marie 1): 20 new agents + the lists mean no shortage. MANUAL.",
      buy_boxes_captured: "Goal 3/day (Marie 2): every vetted buyer should leave a buy box behind. MANUAL.",
      quality_convos: "Goal 12/day: more leads = more at-bats. AUTO — completed calls ≥2 min.",
      outbound_calls: "Goal 140 dials/day: lead volume supports it. AUTO from the phone system.",
      connected_calls: "Goal 100/day: scales with dials. AUTO from the phone system.",
      cc_talk_time: "Goal 75 min/day: matches the conversation raise. AUTO from the phone system.",
      completed_process_calls: "Goal 4/day (Nick 3): the land SOP's core motion — it deserves a floor. MANUAL.",
      offers_made: "Goal 3/day (Nick 2): more process calls → more offers. Land offers can wait 24–48h on developer pricing — log when made. MANUAL.",
      acq_contracts_sent: "Goal 1/day: one contract out the door every day. MANUAL (auto-counted when sent via CRM stage move).",
      acq_talk_time: "Goal 90 min/day (Nick ~57): time on the phone with sellers. AUTO (GHL for Michelle, browser dialer for Nick).",
    };
    for (const [key, definition] of Object.entries(WHY)) {
      const k = await db.kpi.findFirst({ where: { key } });
      if (k) await db.kpi.update({ where: { id: k.id }, data: { definition } });
    }
    out.push("definitions stamped");
    // 5-hour pro-rates (standing Target overrides; most-specific wins)
    const OVERRIDES: Array<{ first: string; goals: Record<string, number> }> = [
      { first: "marie", goals: { dev_conversations: 5, buyers_contacted: 25, answered_calls: 8, ds_talk_time: 3600, deals_sold: 3, buyers_vetted: 1, buy_boxes_captured: 2 } },
      { first: "nicholas", goals: { acq_talk_time: 3400, completed_process_calls: 3, offers_made: 2 } },
      { first: "nick", goals: { acq_talk_time: 3400, completed_process_calls: 3, offers_made: 2 } },
    ];
    for (const o of OVERRIDES) {
      const u = await db.user.findFirst({ where: { active: true, name: { startsWith: o.first, mode: "insensitive" } }, select: { id: true, name: true } });
      if (!u) { if (o.first === "marie") out.push("marie: USER NOT FOUND"); continue; }
      for (const [key, goalValue] of Object.entries(o.goals)) {
        const k = await db.kpi.findFirst({ where: { key }, select: { id: true } });
        if (!k) continue;
        const existing = await db.target.findFirst({ where: { kpiId: k.id, userId: u.id, period: null } });
        if (existing) await db.target.update({ where: { id: existing.id }, data: { goalValue } });
        else await db.target.create({ data: { kpiId: k.id, userId: u.id, period: null, goalValue } });
      }
      out.push(`${u.name}: ${Object.keys(o.goals).length} 5h-shift overrides`);
    }
    return NextResponse.json({ ok: true, done: out });
  }

  // Read-only: every KPI's goal + scope — feeds goal-raise planning.
  if (url.searchParams.get("kpigoals") === "1") {
    const kpis = await db.kpi.findMany({
      select: { key: true, name: true, scope: true, roleKey: true, cadence: true, unit: true, goalValue: true, goalKind: true, active: true },
      orderBy: [{ roleKey: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ ok: true, kpis });
  }

  // One-time: no mailers in this business (Jon 2026-10-07) — repoint the two
  // mail KPIs at Direct REI email replies, per side. Keys normalized so the
  // feed binds; names are what the tiles show.
  if (url.searchParams.get("mailkpifix") === "1") {
    const out: string[] = [];
    const taken = async (key: string) => !!(await db.kpi.findFirst({ where: { key }, select: { id: true } }));
    const seller = await db.kpi.findFirst({ where: { name: { in: ["Mailers Sent", "Direct Mail Sent"] } } });
    if (seller && !(await taken("seller_email_replies"))) { await db.kpi.update({ where: { id: seller.id }, data: { key: "seller_email_replies", name: "Seller Email Replies", emoji: "✉️", definition: "Sellers who replied by email — auto-fed from Direct REI email campaigns." } }); out.push(`${seller.key} → seller_email_replies`); }
    const buyer = await db.kpi.findFirst({ where: { name: { in: ["Mail Responses", "Direct Mail Responses"] }, key: { notIn: ["seller_email_replies", "buyer_email_replies"] } } });
    if (buyer) {
      if (await taken("buyer_email_replies")) { await db.kpi.update({ where: { id: buyer.id }, data: { active: false } }); out.push(`${buyer.key} retired (duplicate mail tile)`); }
      else { await db.kpi.update({ where: { id: buyer.id }, data: { key: "buyer_email_replies", name: "Buyer Email Replies", emoji: "📨", definition: "Buyers who replied by email — auto-fed from Direct REI email campaigns." } }); out.push(`${buyer.key} → buyer_email_replies`); }
    }
    // the old land mail tile duplicates the repointed one — retire it
    const leftover = await db.kpi.findFirst({ where: { key: "land_mail_responses" } });
    if (leftover) { await db.kpi.update({ where: { id: leftover.id }, data: { active: false } }); out.push("land_mail_responses retired"); }
    const team = await db.kpi.findMany({ where: { scope: "team" }, select: { key: true, name: true }, orderBy: { name: "asc" } });
    return NextResponse.json({ ok: true, renamed: out, teamKpis: team });
  }

  // Goal raises (Jon 2026-10-07: lists are pulled for dispo + Michelle has
  // leads — raise the daily minimums). Runs only when Jon says go.
  if (url.searchParams.get("goalraise") === "1") {
    const RAISES: Record<string, number> = {
      // dispositions (Sharyn + Marie)
      dev_conversations: 8, // Buyer Conversations — Jon: "8 to 10", goal 8, stretch beyond
      buyers_contacted: 40, // Dials / Attempts — what it takes to land 8 convos
      answered_calls: 12,
      ds_talk_time: 5400, // 90 min on the phone
      deals_sold: 5, // Deals Sent to Buyers — cascade makes sends cheap
      buyers_vetted: 2,
      buy_boxes_captured: 3,
      // Michelle (cc_lm + acquisitions)
      quality_convos: 12,
      outbound_calls: 140,
      connected_calls: 100,
      cc_talk_time: 4500, // 75 min
      completed_process_calls: 4,
      // offers_made / acq_contracts_sent intentionally NOT raised (Jon
      // 2026-10-07: land offers wait 24–48h on developer pricing — raising
      // the offer floor would punish her for the developers' clock).
    };
    const out: string[] = [];
    for (const [key, goalValue] of Object.entries(RAISES)) {
      const k = await db.kpi.findFirst({ where: { key } });
      if (!k) { out.push(`${key}: NOT FOUND`); continue; }
      await db.kpi.update({ where: { id: k.id }, data: { goalValue, goalKind: "at_least" } });
      out.push(`${k.name}: ${k.goalValue ?? "tracked"} → ${goalValue}`);
    }
    return NextResponse.json({ ok: true, raised: out });
  }

  // Google Sheet hybrid sync — pull the girls' typed cells in, push fresh
  // truth out. Also runs 3×/day via cron (Jon 2026-10-07).
  if (url.searchParams.get("sheetsync") === "1") {
    try {
      const { syncDispoSheet } = await import("@/lib/gsheets");
      return NextResponse.json(await syncDispoSheet());
    } catch (e) { return NextResponse.json({ ok: false, error: String(e).slice(0, 300) }); }
  }

  // 4pm dispo huddle auto-agenda (Jon's SOP: Viktoriia's daily overwatch).
  // Posts every live deal's 24h clock, follow-ups due, and pass rollups to the
  // huddle Chat space — the agenda writes itself.
  if (url.searchParams.get("dispohuddle") === "1") {
    const { sendHuddleChat } = await import("@/lib/notify");
    const deals = await db.deal.findMany({ where: { active: true, status: { in: ["under_contract", "marketing", "buyer_found"] } } });
    const sends = deals.length ? await db.dealSend.findMany({ where: { dealId: { in: deals.map((d) => d.id) } }, select: { dealId: true, sentAt: true, outcome: true, passReason: true, offerAmount: true } }) : [];
    const today = new Date().toISOString().slice(0, 10);
    const fuCount = await db.marketContact.count({ where: { archivedAt: null, vetStage: { in: ["vetted", "active"] }, nextFollowUp: { not: "", lte: today } } });
    const lines: string[] = [`📋 *Dispo huddle — ${deals.length} live deal${deals.length === 1 ? "" : "s"}, ${fuCount} follow-ups due*`];
    for (const d of deals) {
      const ds = sends.filter((s) => s.dealId === d.id);
      const first = ds.reduce<Date | null>((m, s) => (!m || s.sentAt < m ? s.sentAt : m), null);
      const ageH = Math.round((Date.now() - d.createdAt.getTime()) / 3_600_000);
      const clock = first ? `🚀 first send ${Math.round((first.getTime() - d.createdAt.getTime()) / 3_600_000)}h in` : ageH >= 24 ? `🔴 ${ageH}h — NO SEND YET` : `🕐 ${ageH}h, no send`;
      const passes = ds.filter((s) => s.outcome === "pass");
      const offers = ds.map((s) => s.offerAmount).filter((n): n is number => n != null);
      const bits = [clock, `${ds.length} sent`];
      if (offers.length) bits.push(`best offer $${Math.max(...offers).toLocaleString()}`);
      if (passes.length >= 2) {
        const top = [...passes.reduce((m, p) => m.set(p.passReason || "other", (m.get(p.passReason || "other") ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0];
        bits.push(`🚫 ${passes.length} passed (${top[1]}× ${top[0]})`);
      }
      lines.push(`• *${d.address}* (${d.assignedTo || "unassigned"}) — ${bits.join(" · ")}`);
    }
    lines.push("Full board: https://kpi-tracker-lovat.vercel.app/deals");
    const sent = await sendHuddleChat(lines.join("\n"));
    return NextResponse.json({ ok: true, sent, deals: deals.length, followUps: fuCount });
  }

  // Twilio number hunt — which (sub)account actually owns the phone numbers.
  if (url.searchParams.get("twiliohunt") === "1") {
    const { twilioNumberHunt } = await import("@/lib/telco");
    return NextResponse.json({ ok: true, hunt: await twilioNumberHunt() });
  }

  // Scrub a name from the Hall of Fame (WeeklyAward stores plain names, so
  // erased people lingered there). ?hof=1&name=Austin
  if (url.searchParams.get("hof") === "1") {
    const nm = (url.searchParams.get("name") ?? "").trim();
    if (!nm) return NextResponse.json({ ok: false, error: "name required" });
    const r = await db.weeklyAward.deleteMany({ where: { repName: { startsWith: nm } } });
    return NextResponse.json({ ok: true, removed: r.count, name: nm });
  }

  // Auto buy-box coverage maps — rebuild a few stale ones per run (daily cron
  // + fire-and-forget after every interview save).
  if (url.searchParams.get("automaps") === "1") {
    const { refreshAutoMaps } = await import("@/lib/geo/automaps");
    const res = await refreshAutoMaps({ limit: Math.min(12, Number(url.searchParams.get("n")) || 6) });
    return NextResponse.json({ ok: true, automaps: res });
  }

  // One-shot: create the "War Room Vault" Shared Drive as the service account,
  // save it as the Drive root, and prove it with a test upload. If Google
  // refuses (some Workspace policies block SA-created drives), the response
  // says so and Jon creates it by hand instead.
  if (url.searchParams.get("drivesetup") === "1") {
    const { createSharedDrive, setDriveRoot, uploadToFolder, driveRootId } = await import("@/lib/gdrive");
    const existing = url.searchParams.get("driveid"); // Jon can also hand us an id directly
    let id = existing || "";
    let created = false, error = "";
    if (!id) {
      const r = await createSharedDrive("War Room Vault");
      if (r.id) { id = r.id; created = true; } else error = r.error ?? "unknown";
    }
    if (!id) return NextResponse.json({ ok: false, created, error, hint: "Google refused SA drive creation — create a Shared Drive named 'War Room Vault' at drive.google.com, add war-room@war-room-499719.iam.gserviceaccount.com as Content manager, then call ?drivesetup=1&driveid=<ID>." });
    await setDriveRoot(id);
    let testUpload = "";
    try {
      const up = await uploadToFolder(id, `warroom-test-${Date.now()}.txt`, Buffer.from("War Room storage check — safe to delete."), "text/plain");
      testUpload = up.id ? "ok" : "failed";
    } catch (e) { testUpload = String(e).slice(0, 160); }
    return NextResponse.json({ ok: testUpload === "ok", created, driveId: id, root: await driveRootId(), testUpload });
  }

  // Storage audit (Jon 2026-10-02: cut Supabase/Vercel usage, prefer Drive).
  // Reports every Supabase bucket's object count+bytes and the biggest DB tables.
  if (url.searchParams.get("storagereport") === "1") {
    const { adminConfigured, createAdminClient } = await import("@/lib/supabase/admin");
    const buckets: Record<string, { files: number; mb: number; sample: string[] }> = {};
    if (adminConfigured()) {
      const admin = createAdminClient();
      const list = await admin.storage.listBuckets();
      for (const b of list.data ?? []) {
        let files = 0, bytes = 0;
        const sample: string[] = [];
        const walk = async (prefix: string, depth: number) => {
          if (depth > 3) return;
          const { data } = await admin.storage.from(b.name).list(prefix, { limit: 1000 });
          for (const f of data ?? []) {
            const path = prefix ? `${prefix}/${f.name}` : f.name;
            const meta = f.metadata as { size?: number } | null;
            if (meta?.size != null) { files++; bytes += meta.size; if (sample.length < 5) sample.push(`${path} (${Math.round(meta.size / 1024)}kb)`); }
            else await walk(path, depth + 1); // folder
          }
        };
        await walk("", 0).catch(() => {});
        buckets[b.name] = { files, mb: Math.round((bytes / 1048576) * 10) / 10, sample };
      }
    }
    const tables = await db.$queryRawUnsafe<Array<{ relname: string; mb: number; rows: number }>>(
      `SELECT relname, round(pg_total_relation_size(relid)/1048576.0, 1)::float AS mb, n_live_tup::int AS rows
       FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15`,
    ).catch(() => []);
    return NextResponse.json({ ok: true, buckets, tables });
  }

  // Nightly off-site backup — full DB export emailed to the owner(s) as a JSON
  // attachment. (Supabase's own PITR/daily backups are the primary; this is a
  // belt-and-suspenders copy that lands in Jon's inbox.)
  if (url.searchParams.get("backup") === "1") {
    // Nightly buyer backup → Drive (vetted-buyers rebuild Phase 1). Runs first,
    // isolated, so a Drive hiccup never blocks the full email backup below.
    let buyerBackup: unknown = null;
    try {
      const { runBuyerBackup } = await import("@/lib/buyers/backup");
      buyerBackup = await runBuyerBackup();
    } catch (e) { buyerBackup = { ok: false, warning: String(e).slice(0, 200) }; }
    void buyerBackup;
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const backup = await buildBackup();
    const admins = await db.user.findMany({ where: { active: true, role: "admin" }, select: { email: true } });
    const to = admins.map((a) => a.email).filter(Boolean);
    const content = Buffer.from(JSON.stringify(backup), "utf8").toString("base64");
    const emailed = to.length
      ? await sendEmailWithAttachment(
          to,
          `🗄️ War Room backup — ${today} (${backup.totalRows} rows)`,
          `<p>Nightly Freedom Offers War Room backup attached — <strong>${backup.totalRows} rows</strong> across ${Object.keys(backup.counts).length} tables. Keep this email; it's a full off-site copy.</p>`,
          { filename: `war-room-backup-${today}.json`, content },
        )
      : false;
    return NextResponse.json({ ok: true, backedUp: backup.totalRows, emailed, buyerBackup });
  }

  // Weekly vetted-buyer lead-sourcing report → Jon (Friday end-of-shift). Analyzes only the
  // vetted buyers' buy boxes and tells him where to pull leads + which NEW markets to consider.
  if (url.searchParams.get("buyerreport") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const res = await sendBuyerBoxReport(today);
    return NextResponse.json({ ok: true, job: "buyerreport", ...res });
  }

  // Advance any armed buyer cascades whose wait window has elapsed (next 3 buyers).
  if (url.searchParams.get("cascade") === "1") {
    const { advanceCascades } = await import("@/lib/cascade");
    const res = await advanceCascades();
    return NextResponse.json({ ok: true, job: "cascade", ...res });
  }

  // Phone-health digest → posts unhealthy numbers to the phone-health Chat space.
  // NO LONGER SCHEDULED (Jon 2026-09-24: the daily post was all zeros because the
  // manual tracker rows were never filled in — pure noise). Kept for manual runs:
  // /api/cron?phonehealth=1&secret=… — the live API monitoring stays on ?compliance=1.
  if (url.searchParams.get("phonehealth") === "1") {
    const [cfg, rows] = await Promise.all([
      db.resource.findFirst({ where: { category: "__phone_config__" } }),
      db.resource.findMany({ where: { category: "__phone_line__" }, orderBy: { sortOrder: "asc" } }),
    ]);
    const webhook = cfg?.url ?? "";
    if (!webhook || rows.length === 0) return NextResponse.json({ ok: true, job: "phonehealth", sent: false, reason: !webhook ? "no webhook" : "no numbers" });
    const bad: string[] = [];
    for (const r of rows) {
      let m: { provider?: string; label?: string; registered?: boolean; att?: string; verizon?: string; tmobile?: string; answerRate?: number | null } = {};
      try { m = JSON.parse(r.description || "{}"); } catch {}
      const flagged = [m.att, m.verizon, m.tmobile].includes("flagged");
      const lowRate = m.answerRate != null && m.answerRate < 5;
      const notReg = !m.registered;
      if (flagged || lowRate || notReg) {
        const why = [flagged && "🚩 flagged", lowRate && `📉 ${m.answerRate}%`, notReg && "unregistered"].filter(Boolean).join(" · ");
        bad.push(`• ${r.title}${m.label ? ` (${m.label})` : ""} — ${why}`);
      }
    }
    if (bad.length === 0) return NextResponse.json({ ok: true, job: "phonehealth", sent: false, reason: "all healthy" });
    const ok = await postChatWebhook(webhook, `📞 *Phone Health — daily check*\n${bad.length} of ${rows.length} number(s) need attention:\n${bad.join("\n")}\n\nTest + dispute flagged ones; register the rest at freecallerregistry.com.`);
    return NextResponse.json({ ok: true, job: "phonehealth", sent: ok, flagged: bad.length });
  }

  // One-shot maintenance pack (secret-gated, idempotent — Jon's 2026-09-28 "do it
  // now" batch): create Michelle's Leads Generated KPI, ensure Michelle + Sharyn
  // are Position=dispositions (the KPI's role + the research-credit gate),
  // backfill Sharyn's research credits 7 days, take Nick off the time clock.
  if (url.searchParams.get("fixpack") === "1") {
    const report: Record<string, string> = {};
    // Leads Generated lives on Michelle's ACQUISITIONS card (Jon 2026-09-28).
    const kpiSpec = {
      name: "Leads Generated", emoji: "🧲", category: "blue", unit: "count",
      scope: "per_rep", roleKey: "acquisitions", cadence: "daily",
      goalKind: "tracked", goalValue: null, computed: false,
      definition: "Leads Michelle generated today (Jon 2026-09-28). Michelle-only — hidden for every other rep. Convert to a goal in Admin when ready.",
    };
    const existsKpi = await db.kpi.findUnique({ where: { key: "leads_generated" } });
    if (!existsKpi) {
      const agg = await db.kpi.aggregate({ _max: { sortOrder: true } });
      await db.kpi.create({ data: { key: "leads_generated", ...kpiSpec, sortOrder: (agg._max.sortOrder ?? 0) + 1 } });
      report.leadsGenerated = "created (acquisitions)";
    } else if (existsKpi.roleKey !== "acquisitions" || existsKpi.name !== kpiSpec.name || existsKpi.category !== kpiSpec.category) {
      // category "blue" = Activity section on the entry card (green = Money) — Jon 2026-09-28.
      await db.kpi.update({ where: { id: existsKpi.id }, data: { roleKey: "acquisitions", name: kpiSpec.name, category: kpiSpec.category, emoji: existsKpi.emoji || kpiSpec.emoji, definition: kpiSpec.definition } });
      report.leadsGenerated = `normalized: "${existsKpi.name}" (${existsKpi.roleKey}/${existsKpi.category}) → "${kpiSpec.name}" (acquisitions/${kpiSpec.category} = Activity)`;
    } else report.leadsGenerated = "already correct";
    // Deactivate any stray duplicate (e.g. a hand-made "Leads Generated (Caller)").
    const dupes = await db.kpi.findMany({ where: { active: true, key: { not: "leads_generated" }, name: { contains: "Leads Generated" } } });
    for (const d of dupes) await db.kpi.update({ where: { id: d.id }, data: { active: false } });
    if (dupes.length) report.duplicates = `deactivated: ${dupes.map((d) => `"${d.name}" (${d.key})`).join(", ")}`;

    const users = await db.user.findMany({ where: { active: true } });
    const first = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    // Michelle = Acquisitions primary (dispo is her cross-trained secondary);
    // Sharyn = Dispositions primary.
    for (const [who, pos] of [["michelle", "acquisitions"], ["sharyn", "dispositions"]] as const) {
      const u = users.find((x) => first(x.name) === who);
      if (!u) { report[who] = "not found"; continue; }
      if (u.position === pos) report[who] = `position already ${pos}`;
      else {
        await db.user.update({ where: { id: u.id }, data: { position: pos } });
        report[who] = `position fixed: "${u.position || "(blank)"}" → ${pos}`;
      }
    }
    {
      const settings = await getSettings();
      const t = todayStr(settings.orgTimezone);
      for (const who of ["michelle", "sharyn"]) {
        const u = users.find((x) => first(x.name) === who);
        if (!u) continue;
        for (let i = 0; i < 7; i++) {
          const d = new Date(Date.parse(`${t}T12:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
          await rollupResearchKpis(u.id, d);
        }
      }
      report.backfill = "Michelle + Sharyn research credits recomputed for the last 7 days";
    }
    const nick = users.find((x) => ["nick", "nicholas"].includes(first(x.name)));
    if (!nick) report.nick = "not found";
    else if (nick.irregularSchedule) report.nick = "already off the time clock";
    else { await db.user.update({ where: { id: nick.id }, data: { irregularSchedule: true } }); report.nick = "off the time clock"; }
    return NextResponse.json({ ok: true, fixpack: report });
  }

  // One-shot payroll audit (Jon 2026-09-26): from ?start (default 9/16, the
  // period after the Sept-15 payday) to today, how many minutes past shift-end
  // +15 did the OLD +30 grace cap count toward pay? Read-only.
  if (url.searchParams.get("paydayaudit") === "1") {
    const { workedMinutes } = await import("@/lib/presence");
    const { shiftEndAt } = await import("@/lib/shift");
    const { isOwner } = await import("@/lib/auth");
    const settings = await getSettings();
    const today = todayStr(settings.orgTimezone);
    const start = url.searchParams.get("start") ?? "2026-09-16";
    const [users, punches] = await Promise.all([
      db.user.findMany({ where: { active: true, irregularSchedule: false }, select: { id: true, name: true } }),
      db.punch.findMany({ where: { date: { gte: start, lte: today } }, orderBy: { at: "asc" }, select: { userId: true, date: true, kind: true, at: true } }),
    ]);
    const now = new Date();
    const perRep: Record<string, { totalOverMin: number; days: { date: string; overMin: number }[] }> = {};
    for (const u of users.filter((x) => !isOwner(x))) {
      const dates = [...new Set(punches.filter((x) => x.userId === u.id).map((x) => x.date))];
      for (const d of dates) {
        const end = shiftEndAt(d, settings.orgTimezone, u.name);
        if (!end) continue;
        const ps = punches.filter((x) => x.userId === u.id && x.date === d);
        const oldCap = new Date(end.getTime() + 30 * 60000);
        const newCap = new Date(end.getTime() + 15 * 60000);
        const over = Math.max(0, workedMinutes(ps, now, oldCap) - workedMinutes(ps, now, newCap));
        if (over > 0) {
          (perRep[u.name] ??= { totalOverMin: 0, days: [] });
          perRep[u.name].totalOverMin += over;
          perRep[u.name].days.push({ date: d, overMin: over });
        }
      }
    }
    return NextResponse.json({ ok: true, audit: "old +30 cap vs new +15 cap", start, end: today, perRep });
  }

  // One-shot user erase (Jon's explicit removals — secret + exact-name confirm).
  // /api/cron?eraseuser=1&name=<first or full>&confirm=<same>&secret=…
  if (url.searchParams.get("eraseuser") === "1") {
    const name = String(url.searchParams.get("name") ?? "").trim().toLowerCase();
    const confirm = String(url.searchParams.get("confirm") ?? "").trim().toLowerCase();
    if (!name || name !== confirm) return NextResponse.json({ ok: false, error: "name and confirm must match" }, { status: 400 });
    const all = await db.user.findMany();
    const matches = all.filter((u) => u.name.trim().toLowerCase() === name || u.name.trim().split(/\s+/)[0].toLowerCase() === name);
    if (matches.length === 0) return NextResponse.json({ ok: false, error: "no user matched", name });
    if (matches.length > 1) return NextResponse.json({ ok: false, error: "ambiguous — use the full name", candidates: matches.map((m) => m.name) });
    const target = matches[0];
    if (target.active) await db.user.update({ where: { id: target.id }, data: { active: false } });
    const { purgeUser } = await import("@/lib/user-purge");
    const res = await purgeUser(target.id);
    return NextResponse.json({ ok: res.ok, erased: res.name, error: res.error });
  }

  // Daily compliance line check — hits Twilio + Telnyx live via API and posts any
  // issues (numbers not active, account not active, unreachable API) to the
  // phone-health Chat space so we catch line problems before the team feels them.
  if (url.searchParams.get("compliance") === "1") {
    const { allLineHealth, twilioDebuggerAlarms } = await import("@/lib/telco");
    const cfg = await db.resource.findFirst({ where: { category: "__phone_config__" } });
    const webhook = cfg?.url ?? "";
    const [health, alarms] = await Promise.all([allLineHealth(), twilioDebuggerAlarms(10)]);
    const lines: string[] = [];
    for (const h of health) {
      if (h.connected && h.issues.length) lines.push(`*${h.provider}*: ${h.issues.join("; ")}`);
    }
    // Surface any live Twilio Debugger errors from the last check too (plain English).
    const { humanizeAlarm } = await import("@/lib/telco-errors");
    const errAlarms = alarms.filter((a) => a.level === "error").slice(0, 6);
    for (const a of errAlarms) { const h = humanizeAlarm(a.code, a.text); lines.push(`*${a.provider}*${a.code ? ` [${a.code}]` : ""}: ${h.meaning}${h.action ? ` — ${h.action}` : ""}`); }
    if (webhook && lines.length) {
      await postChatWebhook(webhook, `🛡️ *Compliance line check* — issues found:\n${lines.join("\n")}\n\nReview in the War Room → Compliance.`);
    }
    return NextResponse.json({ ok: true, job: "compliance", checked: health.map((h) => ({ p: h.provider, connected: h.connected, issues: h.issues.length })), alarms: errAlarms.length, posted: Boolean(webhook && lines.length) });
  }

  // Payday — checked daily; only sends on actual semi-monthly paydays (the 15th
  // and the last day of the month). `&force=1` sends regardless for a test.
  if (url.searchParams.get("payroll") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    if (!force && !isSemiMonthlyPayday(today)) {
      return NextResponse.json({ ok: true, payday: false });
    }
    const sent = await sendPayrollEmail(today);
    return NextResponse.json({ ok: true, payday: true, sent });
  }

  // Month-end P&L reminder — on the 1st, nudge Viktoriia + Enrico to prepare the expenses
  // for the month that just finished.
  if (url.searchParams.get("monthend") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const d = new Date(today + "T12:00:00Z"); d.setUTCDate(0); // last day of the previous month
    const prevMonth = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthName = new Date(prevMonth + "-01T12:00:00Z").toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    const users = await db.user.findMany({ where: { active: true }, select: { name: true, email: true } });
    const emails = users.filter((u) => ["viktoriia", "enrico"].includes(u.name.trim().split(/\s+/)[0].toLowerCase())).map((u) => u.email).filter(Boolean);
    const msg = `📊 Month-end reminder: please prepare the *${monthName}* expenses in the Profit & Loss Report — the month just closed and the books are due.`;
    await sendTeamChat(msg).catch(() => {});
    if (emails.length) await sendEmailTo(emails, `Prepare ${monthName} expenses — P&L`, `<p>📊 ${monthName} just closed.</p><p>Please open the <b>Profit &amp; Loss Report</b> in the War Room and enter ${monthName}'s expenses.</p>`).catch(() => {});

    // Auto cost-cut analysis → drop the top ideas into the AI Updates feed.
    let cuts = 0;
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        const lineRows = await db.expenseLine.findMany({ where: { month: prevMonth }, select: { category: true, label: true, actual: true } });
        if (lineRows.length) {
          const pnl = JSON.stringify({ month: monthName, lines: lineRows.map((l) => ({ label: l.label, category: l.category, actual: Math.round(l.actual) })) });
          const r = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({
              model: "claude-opus-4-8", max_tokens: 900,
              system: "You are a frugal fractional CFO for a small, currently-unprofitable real-estate wholesaling business. From the month's P&L line items, identify the 2-3 highest-impact cost cuts (cancel, downgrade, consolidate, or renegotiate). Reply with ONLY a JSON array, no prose: [{\"title\":\"short action\",\"rationale\":\"why + est. $/mo saved\"}].",
              messages: [{ role: "user", content: `P&L for ${monthName}:\n${pnl}` }],
            }),
          });
          const j = await r.json();
          const txt = String(j?.content?.[0]?.text ?? "");
          const arr = JSON.parse(txt.slice(txt.indexOf("["), txt.lastIndexOf("]") + 1)) as { title: string; rationale: string }[];
          for (let i = 0; i < Math.min(3, arr.length); i++) {
            const s = arr[i];
            if (!s?.title) continue;
            await db.suggestion.upsert({
              where: { id: `cut-${prevMonth}-${i}` },
              update: {},
              create: { id: `cut-${prevMonth}-${i}`, title: `💸 ${s.title}`, rationale: `${s.rationale} (from the ${monthName} P&L)`, category: "Cost-cut", impact: "high", effort: "S", status: "proposed" },
            });
            cuts++;
          }
        }
      } catch { /* AI advisory is best-effort */ }
    }
    return NextResponse.json({ ok: true, month: prevMonth, emailed: emails, cuts });
  }

  // Culture reminders — birthdays + work anniversaries. Posts to the team Google Chat
  // when there's a celebration TODAY, and (on Mondays) a preview of the week ahead.
  if (url.searchParams.get("culture") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    // Dates come from the Team Roster (TeamProfile): birthday + startDate.
    const [activeUsers, profiles] = await Promise.all([
      db.user.findMany({ where: { active: true }, select: { id: true } }),
      db.teamProfile.findMany({ select: { userId: true, name: true, birthday: true, startDate: true } }),
    ]);
    const activeIds = new Set(activeUsers.map((u) => u.id));
    const people = profiles
      .filter((p) => !p.userId || activeIds.has(p.userId))
      .map((p) => ({ name: p.name, birthday: /^\d{4}-\d{2}-\d{2}$/.test(p.birthday) ? p.birthday.slice(5) : null, hireDate: /^\d{4}-\d{2}-\d{2}$/.test(p.startDate) ? p.startDate : null }));
    const up = upcomingCulture(people, today, 7);
    const todays = up.filter((u) => u.daysUntil === 0);
    const isMonday = laNow().dow === 1;
    let text = "";
    if (todays.length) {
      const lines = todays.map((u) => u.kind === "birthday" ? `🎂 Happy Birthday, *${u.name}*!` : `🎉 *${u.name}* — ${ordinal(u.years ?? 0)} work anniversary today!`);
      text = `*🎉 Culture — today*\n${lines.join("\n")}`;
    } else if (isMonday && up.length) {
      const wk = up.map((u) => `• ${prettyMMDD(u.mmdd)} — ${u.name} ${u.kind === "birthday" ? "🎂 birthday" : `🎖️ ${ordinal(u.years ?? 0)} anniversary`} (${whenLabel(u.daysUntil)})`).join("\n");
      text = `*📅 Culture this week*\n${wk}`;
    }
    if (!text) return NextResponse.json({ ok: true, posted: false });
    const sent = await sendTeamChat(text);
    return NextResponse.json({ ok: true, posted: sent, todays: todays.length });
  }

  // Manual speed-test reminder trigger (no dedicated cron — piggybacks on the
  // runs below). Test: ?speedtest=1&slot=pm&ladow=3 to simulate a slot/day.
  if (url.searchParams.get("speedtest") === "1") {
    const settings = await getSettings();
    const slot = url.searchParams.get("slot") === "pm" ? "pm" : "am";
    const dow = url.searchParams.has("ladow") ? Number(url.searchParams.get("ladow")) : laNow().dow;
    const reminded = await sendShiftStartSpeedReminders(date ?? todayStr(settings.orgTimezone), slot, dow);
    return NextResponse.json({ ok: true, slot, laDow: dow, speedTestReminded: reminded });
  }

  // Weekly Leaks report — Friday end of day (Sat 01:00 UTC ≈ Fri 6pm PT) → C-suite email.
  if (url.searchParams.get("leaks") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const sent = await sendLeaksReport(today);
    return NextResponse.json({ ok: true, leaks: sent });
  }

  // End-of-day: post the "money calls vs recordings uploaded" check to the team so
  // anyone short on recordings uploads before logging off. Runs after the EOD CRM sync.
  if (url.searchParams.get("callcheck") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const res = await sendCallCoverageChat(today, settings.orgTimezone);
    return NextResponse.json({ ok: true, callcheck: res });
  }

  // Nightly: move call recordings off Supabase Storage into Google Drive (free).
  if (url.searchParams.get("recordings") === "1") {
    // Small time-guarded batches — a 60s function can't move 80MB of WAVs in one
    // go (learned 2026-10-02: ten straight FUNCTION_INVOCATION_TIMEOUTs, 0 moved).
    const t0 = Date.now();
    const res = await migrateRecordingsToDrive(2, t0 + 15000);
    const { sweepOrphanRecordings } = await import("@/lib/recording-migrate");
    const budget = Math.min(40, Math.max(5, Number(url.searchParams.get("mb")) || 18)) * 1048576;
    const orphans = await sweepOrphanRecordings(budget, t0 + 45000);
    return NextResponse.json({ ok: true, recordings: res, orphans, secs: Math.round((Date.now() - t0) / 1000) });
  }

  // Direct REI → GoHighLevel push. The rep's "button" = mark Qualified (or tag
  // send-to-ghl) in Direct REI; this pushes each such contact once. Armed only
  // when GHL_PUSH_WEBHOOK_URL is set. ?dry=1 lists who WOULD be pushed.
  if (url.searchParams.get("ghlpush") === "1") {
    const { pushQualifiedToGhl } = await import("@/lib/directrei-ghl-push");
    const res = await pushQualifiedToGhl(url.searchParams.get("dry") === "1");
    return NextResponse.json({ ok: true, ...res });
  }

  // Direct REI feed only — 7 days/week (Jon: outreach runs Sat/Sun too), 1700 PT.
  // Sellers = Michelle (acquisitions), Buyers = Sharyn + Marie (dispo, shared).
  // Direct REI → War Room deal hand-off (Jon 2026-10-06): mirrors Under
  // Contract-and-later Direct REI deals onto the dispo board. ?dreideals=1
  if (url.searchParams.get("dreideals") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const { syncDreiDeals } = await import("@/lib/directrei-deals-sync");
    const r = await syncDreiDeals(today);
    return NextResponse.json({ ok: true, date: today, dreiDeals: r });
  }

  if (url.searchParams.get("dreifeed") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const { refreshDreiFeed } = await import("@/lib/directrei-sync");
    try { const { syncDreiDeals } = await import("@/lib/directrei-deals-sync"); await syncDreiDeals(today); } catch { /* deal hand-off is additive */ }
    const feed = await refreshDreiFeed(today);
    return NextResponse.json({ ok: true, date: today, dreiFeed: feed ? { seller: feed.seller, buyer: feed.buyer, scanned: feed.scanned } : "skipped (DIRECTREI_API_KEY not set)" });
  }

  // Live CRM sync — pulls TODAY's calls + offer/contract stage moves every ~15 min
  // so the scorecard is current throughout the day, not just at night.
  if (url.searchParams.get("crmtoday") === "1") {
    // Time-budgeted: this op grew past the 60s function limit and started
    // timing out (= silent partial KPI feeds). Core scorecard writes run
    // first and ALWAYS; best-effort extras only while budget remains, and
    // the response reports per-step timings so the slow step is visible.
    const settings = await getSettings();
    const tz = settings.orgTimezone;
    const today = date ?? todayStr(tz);
    const deadline = Date.now() + 46_000;
    const timings: Record<string, number | string> = {};
    const step = async <T,>(name: string, core: boolean, fn: () => Promise<T>): Promise<T | null> => {
      if (!core && Date.now() > deadline) { timings[name] = "skipped (budget)"; return null; }
      const t0 = Date.now();
      try { const r = await fn(); timings[name] = Date.now() - t0; return r; }
      catch (e) { timings[name] = `error: ${String(e).slice(0, 80)}`; return null; }
    };
    const calls = await step("ghlCalls", true, () => writeDay(today, tz));
    const opps = await step("ghlOpps", true, () => writeOpps(today, tz));
    const activity = calls && opps ? await step("activity", true, () => writeActivity(today, calls.wrote, opps)) : null;
    const wrOpps = await step("warRoomOpps", true, async () => { const { feedWarRoomOpps } = await import("@/lib/crm-sync"); return feedWarRoomOpps(today, tz); });
    await step("browserCalls", false, async () => { const { feedCrmBrowserCalls } = await import("@/lib/crm-sync"); return feedCrmBrowserCalls(today, tz); });
    const drei = await step("dreiFeed", false, async () => { const { refreshDreiFeed } = await import("@/lib/directrei-sync"); return refreshDreiFeed(today); });
    await step("dreiDeals", false, async () => { const { syncDreiDeals } = await import("@/lib/directrei-deals-sync"); return syncDreiDeals(today); });
    return NextResponse.json({ ok: true, date: today, calls: calls?.wrote ?? null, offersContracts: opps?.counts ?? null, warRoomOpps: wrOpps, activity, dreiFeed: drei ? "refreshed" : "skipped", timings });
  }

  // Nightly REI Reply CRM sync — pulls YESTERDAY's calls + offer/contract stage
  // moves and writes them to the scorecard (talk time, conversations, dials,
  // offers made, contracts sent). 1am PT.
  if (url.searchParams.get("crm") === "1") {
    const settings = await getSettings();
    const tz = settings.orgTimezone;
    const today = date ?? todayStr(tz);
    const y = new Date(today + "T12:00:00Z"); y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = url.searchParams.get("date") ?? y.toISOString().slice(0, 10);
    const calls = await writeDay(yesterday, tz);
    const opps = await writeOpps(yesterday, tz);
    const activity = await writeActivity(yesterday, calls.wrote, opps);
    return NextResponse.json({ ok: true, date: yesterday, calls: calls.wrote, offersContracts: opps.counts, activity });
  }

  // Daily huddle brief — 9:45am PT, Mon–Fri (after the 9am huddle, so the team has
  // updated their goals first) → Google Chat + leadership email.
  if (url.searchParams.get("huddle") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const sent = await sendHuddleBrief(today);
    return NextResponse.json({ ok: true, huddle: sent });
  }

  // Huddle nudge — 9:30am PT (am) + 4:30pm PT (pm), Mon–Fri. Pings whoever hasn't
  // set today's goals / has open items, so the manager doesn't have to chase.
  if (url.searchParams.get("huddlenudge")) {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const slot = url.searchParams.get("huddlenudge") === "pm" ? "pm" : "am";
    const res = await sendHuddleNudge(today, slot);
    return NextResponse.json({ ok: true, huddlenudge: res });
  }

  // Gentle break-time reminders (org-local, weekdays): 10:30 break, 12:00 lunch, 3:00 break.
  // Each is its own once-a-day cron in vercel.json. Posts to the Timecard Chat space.
  if (url.searchParams.get("breaknudge")) {
    const slot = url.searchParams.get("breaknudge");
    const msg =
      slot === "lunch"
        ? "🍔 *Lunch — 12:00.* Whole team's on lunch now. Step away, eat, recharge — then log it on your time card."
        : slot === "pm"
          ? "☕ *Afternoon break — ~3:00.* Everyone grab a quick 15 minutes to reset before the final push. (Log it on your time card.)"
          : "☕ *Break time — 10:30.* Michelle, Sharyn & Jon — take a quick 10–15 min to reset. You've earned it.";
    const chat = await sendTimecardChat(msg);
    return NextResponse.json({ ok: true, breaknudge: slot, chat });
  }

  // Midday run (~1:30pm PT): the pm-shift crew's start-of-shift speed nudge
  // (Marie) + the post-lunch RE-check nudge for the morning crew (Mon–Thu —
  // Friday has no lunch). Also prunes speed-check logs older than 60 days.
  // (Legacy ?ethan=1 param.)
  if (url.searchParams.get("ethan") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const la = laNow();
    const speedTestReminded = await sendShiftStartSpeedReminders(today, "pm", la.dow);
    const postLunchReminded = await sendPostLunchSpeedReminders(today, la.dow);
    await db.resource.deleteMany({
      where: { category: SPEED_CHECKS_CATEGORY, createdAt: { lt: new Date(Date.now() - 60 * 86400000) } },
    });
    return NextResponse.json({ ok: true, speedTestReminded, postLunchReminded });
  }

  // Full scheduled pass. On the MORNING run (before noon PT) also send the am
  // crew (Michelle/Sharyn, + Marie on Fri) their start-of-shift speed reminder.
  const la = laNow();
  let speedTestReminded = 0;
  if (la.hour < 12) {
    const settings = await getSettings();
    speedTestReminded = await sendShiftStartSpeedReminders(date ?? todayStr(settings.orgTimezone), "am", la.dow);
  }
  // Self-heal the research-derived dispo KPIs: recompute today + yesterday for
  // every dispositions rep, so credited work still lands even when it was done
  // before a Position fix or a rollup hiccup (idempotent; auto entries only).
  {
    const settings = await getSettings();
    const t = todayStr(settings.orgTimezone);
    const y = new Date(Date.parse(`${t}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
    // rollupResearchKpis itself gates on primary-or-secondary dispositions, so
    // include hybrids (e.g. Michelle: acq primary, dispo secondary).
    const activeReps = await db.user.findMany({ where: { active: true, position: { in: ["dispositions", "acquisitions"] } }, select: { id: true } });
    for (const r of activeReps) { await rollupResearchKpis(r.id, t); await rollupResearchKpis(r.id, y); }
  }

  // Close any time card left open past its scheduled shift (forgot to clock out).
  const autoClockedOut = await autoCloseAbandonedSessions();
  const result = await runScheduledChecks({ date, force, weekly, review });
  return NextResponse.json({ ok: true, speedTestReminded, autoClockedOut, ...result });
}
