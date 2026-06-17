import crypto from "crypto";
import { db } from "@/lib/db";

// Google Calendar push for approved time off — service-account owned calendar
// (Option B: works without changing Workspace external-sharing policy). No deps.
//
// Configure in Vercel (only TWO required):
//   GOOGLE_SA_EMAIL          service-account email (…@…iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY    the service account's private key (PEM; \n-escaped ok)
//   GCAL_TIMEOFF_CALENDAR_ID (optional) force a specific calendar instead of auto-creating
//
// On first approval the service account creates its OWN "Freedom Offers — Time Off"
// calendar, shares it read-only with the active team, and stores the id in Settings.

export function gcalConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SA_EMAIL;
  let key = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !key) return null;
  key = key.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/calendar", // full: create calendar + ACL + events
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claim}`;
  let jwt: string;
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    jwt = `${signingInput}.${b64url(signer.sign(key))}`;
  } catch (err) {
    console.error("[gcal] JWT sign failed:", err);
    return null;
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    });
    if (!res.ok) {
      console.error("[gcal] token request failed:", res.status, await res.text());
      return null;
    }
    return (await res.json()).access_token ?? null;
  } catch (err) {
    console.error("[gcal] token error:", err);
    return null;
  }
}

// Resolve (or, with create=true, provision) the Time Off calendar id.
async function resolveCalendarId(token: string, create: boolean): Promise<string | null> {
  if (process.env.GCAL_TIMEOFF_CALENDAR_ID) return process.env.GCAL_TIMEOFF_CALENDAR_ID;
  const s = await db.settings.findUnique({ where: { id: 1 } });
  if (s?.timeoffCalendarId) return s.timeoffCalendarId;
  if (!create) return null;

  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  // Create a calendar the service account fully owns.
  const cr = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: H,
    body: JSON.stringify({ summary: "Freedom Offers — Time Off", timeZone: "America/Los_Angeles" }),
  });
  if (!cr.ok) {
    console.error("[gcal] calendar create failed:", cr.status, await cr.text());
    return null;
  }
  const calId: string = (await cr.json()).id;

  // Share read-only with the active team so everyone can see/subscribe.
  const users = await db.user.findMany({ where: { active: true }, select: { email: true } });
  for (const u of users) {
    if (!u.email) continue;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/acl`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ role: "reader", scope: { type: "user", value: u.email } }),
    }).catch(() => {});
  }

  await db.settings
    .upsert({ where: { id: 1 }, update: { timeoffCalendarId: calId }, create: { id: 1, timeoffCalendarId: calId } })
    .catch((err) => console.error("[gcal] persist calendar id failed:", err));
  return calId;
}

// All-day events use an exclusive end date — bump endDate by one day.
function nextDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}

const TYPE_LABEL: Record<string, string> = { pto: "PTO", holiday: "Holiday", sick: "Sick", unpaid: "Unpaid" };

/** Create an all-day time-off event on the shared calendar. Returns the event id, or null. */
export async function createTimeOffEvent(opts: {
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  note?: string;
}): Promise<string | null> {
  if (!gcalConfigured()) return null;
  const token = await getAccessToken();
  if (!token) return null;
  const calId = await resolveCalendarId(token, true);
  if (!calId) return null;
  const label = TYPE_LABEL[opts.type] ?? opts.type;
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `${opts.name} — ${label}${opts.note ? ` (${opts.note})` : ""}`,
        description: "Time off approved in the Freedom Offers War Room.",
        start: { date: opts.startDate },
        end: { date: nextDay(opts.endDate) },
        transparency: "transparent",
      }),
    });
    if (!res.ok) {
      console.error("[gcal] event create failed:", res.status, await res.text());
      return null;
    }
    return (await res.json()).id ?? null;
  } catch (err) {
    console.error("[gcal] event create error:", err);
    return null;
  }
}

/** Delete a previously-created time-off event (on deny / removal). Best-effort. */
export async function deleteTimeOffEvent(eventId: string): Promise<void> {
  if (!gcalConfigured() || !eventId) return;
  const token = await getAccessToken();
  if (!token) return;
  const calId = await resolveCalendarId(token, false);
  if (!calId) return;
  try {
    await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
    );
  } catch (err) {
    console.error("[gcal] event delete error:", err);
  }
}
