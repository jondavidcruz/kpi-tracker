// Google Calendar sync for CRM appointments (Jon 2026-10-07: "sync with
// everyone's personal google cal so they won't miss appointments").
// Uses the same service account as Drive/Sheets but with the calendar scope.
// Each teammate shares their OWN calendar once (Google Calendar → Settings →
// Share with specific people → the SA email below → "Make changes to events")
// — then booked appointments appear straight on their personal calendar.
import crypto from "crypto";
import { db } from "./db";

type SA = { client_email: string; private_key: string };
function serviceAccount(): SA {
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
}
export function gcalConfigured(): boolean {
  try { return Boolean(serviceAccount().client_email); } catch { return false; }
}
export function serviceAccountEmail(): string {
  try { return serviceAccount().client_email ?? ""; } catch { return ""; }
}

let cached: { token: string; exp: number } | null = null;
async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`); signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("gcal auth failed: " + JSON.stringify(j).slice(0, 160));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

const MAP_CAT = "__gcal_events__"; // apptId → {cal, eventId}

async function readMap(): Promise<{ rowId: string | null; map: Record<string, { cal: string; eventId: string }> }> {
  const row = await db.resource.findFirst({ where: { category: MAP_CAT } });
  let map: Record<string, { cal: string; eventId: string }> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  return { rowId: row?.id ?? null, map };
}
async function writeMap(rowId: string | null, map: Record<string, { cal: string; eventId: string }>) {
  const entries = Object.entries(map).slice(-500); // keep it bounded
  const description = JSON.stringify(Object.fromEntries(entries));
  if (rowId) await db.resource.update({ where: { id: rowId }, data: { description } }).catch(() => {});
  else await db.resource.create({ data: { title: "gcal-events", category: MAP_CAT, url: "", description } }).catch(() => {});
}

/** Push an appointment onto the rep's PERSONAL calendar (their email = the
 * calendar id, works once they've shared it with the service account). */
export async function pushApptToGcal(a: { id: string; title: string; at: Date; note: string; withWho: string; leadName?: string; oppId?: string }): Promise<{ ok: boolean; why?: string }> {
  try {
    if (!gcalConfigured()) return { ok: false, why: "no service account" };
    const who = a.withWho.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const user = who ? await db.user.findFirst({ where: { active: true, name: { startsWith: who, mode: "insensitive" } }, select: { email: true } }) : null;
    if (!user?.email) return { ok: false, why: `no user email for "${a.withWho}"` };
    const t = await token();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(user.email)}/events`, {
      method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `${a.title}${a.leadName ? ` — ${a.leadName}` : ""}`,
        description: `${a.note}\n\nWar Room: https://kpi-tracker-lovat.vercel.app/crm/${a.oppId ?? ""}`,
        start: { dateTime: a.at.toISOString() },
        end: { dateTime: new Date(a.at.getTime() + 30 * 60_000).toISOString() },
        reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }, { method: "popup", minutes: 10 }] },
      }),
    });
    const j = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !j.id) return { ok: false, why: j.error?.message ?? `HTTP ${res.status}` };
    const { rowId, map } = await readMap();
    map[a.id] = { cal: user.email, eventId: j.id };
    await writeMap(rowId, map);
    return { ok: true };
  } catch (e) { return { ok: false, why: String(e).slice(0, 120) }; }
}

/** Remove the mirrored event when an appointment is cancelled. */
export async function removeApptFromGcal(apptId: string): Promise<void> {
  try {
    const { rowId, map } = await readMap();
    const m = map[apptId];
    if (!m) return;
    const t = await token();
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(m.cal)}/events/${m.eventId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${t}` },
    }).catch(() => {});
    delete map[apptId];
    await writeMap(rowId, map);
  } catch { /* best effort */ }
}

// ── Time-off calendar (pre-existing feature — restored after the appointment
// sync rewrite; same service account, shared "Freedom Offers — Time Off" cal).
async function getAccessToken(): Promise<string | null> {
  try { return await token(); } catch (err) { console.error("[gcal] token error:", err); return null; }
}

async function resolveCalendarId(tok: string, create: boolean): Promise<string | null> {
  if (process.env.GCAL_TIMEOFF_CALENDAR_ID) return process.env.GCAL_TIMEOFF_CALENDAR_ID;
  const s = await db.settings.findUnique({ where: { id: 1 } });
  if (s?.timeoffCalendarId) return s.timeoffCalendarId;
  if (!create) return null;
  const H = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" };
  const cr = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST", headers: H,
    body: JSON.stringify({ summary: "Freedom Offers — Time Off", timeZone: "America/Los_Angeles" }),
  });
  if (!cr.ok) { console.error("[gcal] calendar create failed:", cr.status, await cr.text()); return null; }
  const calId: string = (await cr.json()).id;
  const users = await db.user.findMany({ where: { active: true }, select: { email: true } });
  for (const u of users) {
    if (!u.email) continue;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/acl`, {
      method: "POST", headers: H,
      body: JSON.stringify({ role: "reader", scope: { type: "user", value: u.email } }),
    }).catch(() => {});
  }
  await db.settings
    .upsert({ where: { id: 1 }, update: { timeoffCalendarId: calId }, create: { id: 1, timeoffCalendarId: calId } })
    .catch((err) => console.error("[gcal] persist calendar id failed:", err));
  return calId;
}

function nextDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}

const TYPE_LABEL: Record<string, string> = { vacation: "Vacation", emergency: "Emergency leave", sick: "Sick", special: "Special event", pto: "Time off", holiday: "Holiday", unpaid: "Unpaid" };

/** Create an all-day time-off event on the shared calendar. Returns the event id, or null. */
export async function createTimeOffEvent(opts: { name: string; type: string; startDate: string; endDate: string; note?: string }): Promise<string | null> {
  if (!gcalConfigured()) return null;
  const tok = await getAccessToken();
  if (!tok) return null;
  const calId = await resolveCalendarId(tok, true);
  if (!calId) return null;
  const label = TYPE_LABEL[opts.type] ?? opts.type;
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, {
      method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `${opts.name} — ${label}${opts.note ? ` (${opts.note})` : ""}`,
        description: "Time off approved in the Freedom Offers War Room.",
        start: { date: opts.startDate },
        end: { date: nextDay(opts.endDate) },
        transparency: "transparent",
      }),
    });
    if (!res.ok) { console.error("[gcal] event create failed:", res.status, await res.text()); return null; }
    return (await res.json()).id ?? null;
  } catch (err) { console.error("[gcal] event create error:", err); return null; }
}

/** Delete a previously-created time-off event (on deny / removal). Best-effort. */
export async function deleteTimeOffEvent(eventId: string): Promise<void> {
  if (!gcalConfigured() || !eventId) return;
  const tok = await getAccessToken();
  if (!tok) return;
  const calId = await resolveCalendarId(tok, false);
  if (!calId) return;
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok}` } });
  } catch (err) { console.error("[gcal] event delete error:", err); }
}
