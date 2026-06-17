import crypto from "crypto";

// Minimal Google Calendar push via a service account — no extra npm deps.
// Configure in Vercel with these env vars (all three required):
//   GOOGLE_SA_EMAIL            service-account email (…@…iam.gserviceaccount.com)
//   GOOGLE_SA_PRIVATE_KEY      the service account's private key (PEM; \n-escaped is fine)
//   GCAL_TIMEOFF_CALENDAR_ID   the calendar to write approved time off into
// Then share that calendar with GOOGLE_SA_EMAIL as "Make changes to events".

export function gcalConfigured(): boolean {
  return !!(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY && process.env.GCAL_TIMEOFF_CALENDAR_ID);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string | null> {
  const email = process.env.GOOGLE_SA_EMAIL;
  let key = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !key) return null;
  key = key.replace(/\\n/g, "\n"); // Vercel stores newlines escaped
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/calendar.events",
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
    const j = await res.json();
    return j.access_token ?? null;
  } catch (err) {
    console.error("[gcal] token error:", err);
    return null;
  }
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
  const calId = process.env.GCAL_TIMEOFF_CALENDAR_ID!;
  const label = TYPE_LABEL[opts.type] ?? opts.type;
  const body = {
    summary: `${opts.name} — ${label}${opts.note ? ` (${opts.note})` : ""}`,
    description: "Time off approved in the Freedom Offers War Room.",
    start: { date: opts.startDate },
    end: { date: nextDay(opts.endDate) },
    transparency: "transparent",
  };
  try {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("[gcal] event create failed:", res.status, await res.text());
      return null;
    }
    const j = await res.json();
    return j.id ?? null;
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
  const calId = process.env.GCAL_TIMEOFF_CALENDAR_ID!;
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    console.error("[gcal] event delete error:", err);
  }
}
