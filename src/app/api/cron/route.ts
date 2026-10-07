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
    const pipelines = (plBody.pipelines ?? []).filter((p) => APPROVED.some((rx) => rx.test(p.name)));
    const stageName = new Map<string, string>();
    for (const p of plBody.pipelines ?? []) for (const st of p.stages ?? []) stageName.set(st.id, st.name);
    // GHL parity: keep the EXACT pipeline + stage (slug of GHL's stage name)
    const { stageSlug } = await import("@/lib/crm");
    const mapStage = (n: string) => (n ? stageSlug(n) : "contacted");
    const repByCrm = new Map(AGENTS.map((a) => [a.crm, a.first]));
    const users = await db.user.findMany({ where: { active: true }, select: { name: true } });
    const fullName = (first: string) => users.find((u) => u.name.toLowerCase().startsWith(first))?.name ?? "";
    type Row = { ghlOppId: string; ghlContactId: string; name: string; phone: string; email: string; title: string; value: number | null; rep: string; stage: string; pipeline: string };
    const rows: Row[] = [];
    for (const p of pipelines) {
      const res = await searchOpportunities(p.id);
      if (!res.ok) continue;
      const body = res.body as { opportunities?: Array<Record<string, unknown>> };
      for (const o of body.opportunities ?? []) {
        if (String(o.status ?? "") !== "open") continue;
        const contact = (o.contact ?? {}) as { id?: string; name?: string; phone?: string; email?: string };
        const ghlStage = stageName.get(String(o.pipelineStageId ?? "")) ?? "";
        // "respective user": GHL owner wins; JrAQ: Nick pipeline defaults to Nicholas
        const owner = fullName(repByCrm.get(String(o.assignedTo ?? "")) ?? "");
        const rep = owner || (/nick/i.test(p.name) ? (fullName("nicholas") || fullName("nick") || "Nicholas Fair") : "");
        rows.push({
          ghlOppId: String(o.id ?? ""), ghlContactId: String(contact.id ?? o.contactId ?? ""),
          name: String(contact.name ?? o.name ?? "—"), phone: String(contact.phone ?? ""), email: String(contact.email ?? ""),
          title: String(o.name ?? contact.name ?? "Imported opportunity"),
          value: o.monetaryValue != null ? Number(o.monetaryValue) : null,
          rep, stage: mapStage(ghlStage), pipeline: p.name,
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
            if (r.ghlContactId) {
              const nres = await ghlGet(`/contacts/${r.ghlContactId}/notes`);
              const nbody = nres.body as { notes?: Array<{ body?: string; dateAdded?: string }> };
              for (const n of (nbody.notes ?? []).slice(0, 50)) {
                if (!n.body) continue;
                await db.crmEvent.create({ data: { contactId, kind: "note", body: String(n.body).slice(0, 2000), actor: "GHL import", at: n.dateAdded ? new Date(n.dateAdded) : new Date() } }).catch(() => {});
                notes++;
              }
            }
          }
          if (r.ghlContactId) byGhlContact.set(r.ghlContactId, contactId);
        }
        const dupOpp = await db.crmOpportunity.findFirst({ where: { ghlId: r.ghlOppId } });
        if (dupOpp) {
          await db.crmOpportunity.update({ where: { id: dupOpp.id }, data: { pipeline: r.pipeline, stage: r.stage, assignedTo: r.rep || dupOpp.assignedTo, tags: "ghl-import", archivedAt: null } });
          updated++;
          continue;
        }
        const opp = await db.crmOpportunity.create({ data: { contactId, title: r.title.slice(0, 160), pipeline: r.pipeline, stage: r.stage, value: r.value, assignedTo: r.rep, ghlId: r.ghlOppId, tags: "ghl-import" } });
        await logCrmEvent({ contactId, oppId: opp.id, kind: "system", body: `Imported from GHL — ${r.pipeline}`, actor: "ghl-import" });
        opps++;
      }
      // archive earlier imports that came from pipelines Jon excluded
      const keep = new Set(rows.map((r) => r.ghlOppId));
      const stray = await db.crmOpportunity.findMany({ where: { ghlId: { not: "" }, archivedAt: null, tags: { contains: "ghl-import" } }, select: { id: true, ghlId: true } });
      for (const s2 of stray) {
        if (keep.has(s2.ghlId)) continue;
        await db.crmOpportunity.update({ where: { id: s2.id }, data: { archivedAt: new Date(), stage: "nurture" } });
        archived++;
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
      const res = await searchOpportunities(p.id);
      if (!res.ok) continue;
      const body = res.body as { opportunities?: Array<Record<string, unknown>> };
      for (const o of body.opportunities ?? []) {
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
    const settings = await getSettings();
    const tz = settings.orgTimezone;
    const today = date ?? todayStr(tz);
    const calls = await writeDay(today, tz);
    const opps = await writeOpps(today, tz);
    const activity = await writeActivity(today, calls.wrote, opps);
    try { const { feedCrmBrowserCalls } = await import("@/lib/crm-sync"); await feedCrmBrowserCalls(today, tz); } catch { /* additive */ }
    // Direct REI pulse rides the same 5×/day schedule (best-effort).
    let drei: unknown = null;
    try { const { refreshDreiFeed } = await import("@/lib/directrei-sync"); drei = await refreshDreiFeed(today); } catch { /* feed is additive */ }
    try { const { syncDreiDeals } = await import("@/lib/directrei-deals-sync"); await syncDreiDeals(today); } catch { /* deal hand-off is additive */ }
    return NextResponse.json({ ok: true, date: today, calls: calls.wrote, offersContracts: opps.counts, activity, dreiFeed: drei ? "refreshed" : "skipped" });
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
