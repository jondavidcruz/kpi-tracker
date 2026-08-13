// Live line-health checks against Twilio + Telnyx. Reads API credentials from env
// (never stored in the DB). Each check is defensive: short timeout, try/catch, and
// a normalized shape so the UI can render "connected / not connected / issues" the
// same way for both providers. No creds → connected:false with a setup hint.
//
// Env vars (set in Vercel):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
//   TELNYX_API_KEY

export interface LineHealth {
  provider: "Twilio" | "Telnyx";
  role: string;                 // which CRM / channel this account powers
  connected: boolean;
  reason?: string;              // why not connected (missing creds / error)
  numbers?: number;            // count of phone numbers on the account
  detail?: string;             // one-line human summary
  issues: string[];            // things that need attention (empty = healthy)
  a2p?: { label: string; ok: boolean }[]; // A2P 10DLC brand/campaign status chips
  checkedAt: string;           // ISO
}

// Twilio powers the ACQUISITIONS CRM (calls / dialer); Telnyx powers the MARKETING
// CRM (outbound SMS / dialer / email / mail campaigns).
export const TWILIO_ROLE = "Acquisitions CRM · calls & dialer";
export const TELNYX_ROLE = "Marketing CRM · SMS, dialer & mail";

/** Which telco credentials the running server can actually see (never the values). */
export function telcoEnvStatus(): { twilioSid: boolean; twilioToken: boolean; telnyx: boolean } {
  return {
    twilioSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
    twilioToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
    telnyx: Boolean(process.env.TELNYX_API_KEY),
  };
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 8000): Promise<{ ok: boolean; status: number; json: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

/** Twilio: account status + incoming number count. Basic auth (SID:AuthToken). */
export async function twilioHealth(): Promise<LineHealth> {
  const now = new Date().toISOString();
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return { provider: "Twilio", role: TWILIO_ROLE, connected: false, reason: "Add TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in Vercel to enable live monitoring.", issues: [], checkedAt: now };
  }
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const acct = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: auth } });
    if (!acct.ok) {
      return { provider: "Twilio", role: TWILIO_ROLE, connected: false, reason: `Twilio API returned ${acct.status} — check the credentials.`, issues: [], checkedAt: now };
    }
    const a = acct.json as { status?: string; friendly_name?: string };
    const issues: string[] = [];
    if (a.status && a.status !== "active") issues.push(`Account status is "${a.status}" (not active).`);

    // Number count (best-effort).
    let numbers: number | undefined;
    const nums = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=1`, { headers: { Authorization: auth } });
    if (nums.ok) {
      const n = nums.json as { total?: number };
      if (typeof n.total === "number") numbers = n.total;
    }
    // A2P 10DLC brand registration status (best-effort — texting compliance headline).
    const a2p: { label: string; ok: boolean }[] = [];
    try {
      const br = await fetchJson(`https://messaging.twilio.com/v1/a2p/BrandRegistrations`, { headers: { Authorization: auth } });
      if (br.ok) {
        const rows = ((br.json as { data?: unknown[]; brand_registrations?: unknown[] }).data
          ?? (br.json as { brand_registrations?: unknown[] }).brand_registrations
          ?? []) as { status?: string; brand_type?: string }[];
        for (const b of rows.slice(0, 6)) {
          const st = (b.status ?? "UNKNOWN").toUpperCase();
          const ok = st === "APPROVED";
          a2p.push({ label: `Brand: ${st}`, ok });
          if (!ok) issues.push(`A2P brand registration is ${st} (not APPROVED) — texts can be filtered until it's approved.`);
        }
        if (rows.length === 0) a2p.push({ label: "No A2P brand registered", ok: false });
      }
    } catch { /* A2P is best-effort */ }

    return {
      provider: "Twilio", role: TWILIO_ROLE,
      connected: true,
      numbers,
      detail: `${a.friendly_name ?? "Account"} · status ${a.status ?? "?"}${numbers != null ? ` · ${numbers} number(s)` : ""}`,
      issues,
      a2p: a2p.length ? a2p : undefined,
      checkedAt: now,
    };
  } catch (e) {
    return { provider: "Twilio", role: TWILIO_ROLE, connected: false, reason: `Couldn't reach Twilio (${(e as Error).name}).`, issues: [], checkedAt: now };
  }
}

/** Telnyx: phone-number count + any numbers not in an active state. Bearer API key. */
export async function telnyxHealth(): Promise<LineHealth> {
  const now = new Date().toISOString();
  const key = process.env.TELNYX_API_KEY;
  if (!key) {
    return { provider: "Telnyx", role: TELNYX_ROLE, connected: false, reason: "Add TELNYX_API_KEY in Vercel to enable live monitoring.", issues: [], checkedAt: now };
  }
  try {
    const res = await fetchJson(`https://api.telnyx.com/v2/phone_numbers?page[size]=250`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      return { provider: "Telnyx", role: TELNYX_ROLE, connected: false, reason: `Telnyx API returned ${res.status} — check the API key.`, issues: [], checkedAt: now };
    }
    const body = res.json as { data?: { status?: string; phone_number?: string }[]; meta?: { total_results?: number } };
    const data = body.data ?? [];
    const numbers = body.meta?.total_results ?? data.length;
    const notActive = data.filter((d) => d.status && d.status !== "active");
    const issues: string[] = [];
    if (notActive.length) issues.push(`${notActive.length} Telnyx number(s) not active: ${notActive.slice(0, 5).map((d) => `${d.phone_number ?? "?"} (${d.status})`).join(", ")}`);

    // 10DLC brand + campaign registration status (best-effort).
    const a2p: { label: string; ok: boolean }[] = [];
    try {
      const brand = await fetchJson(`https://api.telnyx.com/v2/10dlc/brand`, { headers: { Authorization: `Bearer ${key}` } });
      if (brand.ok) {
        const recs = ((brand.json as { records?: unknown[]; data?: unknown[] }).records ?? (brand.json as { data?: unknown[] }).data ?? []) as { identityStatus?: string; status?: string }[];
        for (const b of recs.slice(0, 4)) {
          const st = (b.identityStatus ?? b.status ?? "UNKNOWN").toUpperCase();
          const ok = st === "VERIFIED" || st === "APPROVED" || st === "ACTIVE";
          a2p.push({ label: `Brand: ${st}`, ok });
          if (!ok) issues.push(`10DLC brand is ${st} (not verified) — register/verify to avoid carrier filtering.`);
        }
      }
      const camp = await fetchJson(`https://api.telnyx.com/v2/10dlc/campaign?page[size]=20`, { headers: { Authorization: `Bearer ${key}` } });
      if (camp.ok) {
        const recs = ((camp.json as { records?: unknown[]; data?: unknown[] }).records ?? (camp.json as { data?: unknown[] }).data ?? []) as { status?: string; campaignId?: string }[];
        for (const c of recs.slice(0, 6)) {
          const st = (c.status ?? "UNKNOWN").toUpperCase();
          const ok = ["ACTIVE", "TCR_ACCEPTED", "APPROVED", "REGISTERED"].includes(st);
          a2p.push({ label: `Campaign: ${st}`, ok });
          if (!ok) issues.push(`10DLC campaign ${c.campaignId ?? ""} is ${st} — texts may be blocked until it's active.`);
        }
        if (recs.length === 0) a2p.push({ label: "No 10DLC campaign", ok: false });
      }
    } catch { /* A2P is best-effort */ }

    return {
      provider: "Telnyx", role: TELNYX_ROLE,
      connected: true,
      numbers,
      detail: `${numbers} number(s)${notActive.length ? ` · ${notActive.length} need attention` : " · all active"}`,
      issues,
      a2p: a2p.length ? a2p : undefined,
      checkedAt: now,
    };
  } catch (e) {
    return { provider: "Telnyx", role: TELNYX_ROLE, connected: false, reason: `Couldn't reach Telnyx (${(e as Error).name}).`, issues: [], checkedAt: now };
  }
}

/** Both providers in parallel. */
export async function allLineHealth(): Promise<LineHealth[]> {
  return Promise.all([twilioHealth(), telnyxHealth()]);
}

export interface LiveAlarm { provider: string; level: string; code?: string; text: string; at: string }

/** Twilio Debugger alerts (errors/warnings) pulled live — e.g. 30007 message filtered,
 *  11200 HTTP retrieval failure. Best-effort; empty if no creds or API error. */
export async function twilioDebuggerAlarms(limit = 15): Promise<LiveAlarm[]> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return [];
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const res = await fetchJson(`https://monitor.twilio.com/v1/Alerts?PageSize=${limit}`, { headers: { Authorization: auth } });
    if (!res.ok) return [];
    const rows = ((res.json as { alerts?: unknown[] }).alerts ?? []) as { error_code?: string; log_level?: string; alert_text?: string; more_info?: string; date_generated?: string }[];
    return rows.map((a) => ({
      provider: "Twilio",
      level: (a.log_level ?? "error").toLowerCase(),
      code: a.error_code ? String(a.error_code) : undefined,
      text: (a.alert_text ?? a.more_info ?? "Twilio alert").slice(0, 200),
      at: a.date_generated ?? new Date().toISOString(),
    }));
  } catch { return []; }
}
