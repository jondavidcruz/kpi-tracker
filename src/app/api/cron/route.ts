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
    out.DIRECTREI_API_KEY = { set: !!process.env.DIRECTREI_API_KEY };
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
  if (url.searchParams.get("dreifeed") === "1") {
    const settings = await getSettings();
    const today = date ?? todayStr(settings.orgTimezone);
    const { refreshDreiFeed } = await import("@/lib/directrei-sync");
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
    // Direct REI pulse rides the same 5×/day schedule (best-effort).
    let drei: unknown = null;
    try { const { refreshDreiFeed } = await import("@/lib/directrei-sync"); drei = await refreshDreiFeed(today); } catch { /* feed is additive */ }
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
