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
  connected: boolean;
  reason?: string;              // why not connected (missing creds / error)
  numbers?: number;            // count of phone numbers on the account
  detail?: string;             // one-line human summary
  issues: string[];            // things that need attention (empty = healthy)
  checkedAt: string;           // ISO
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
    return { provider: "Twilio", connected: false, reason: "Add TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in Vercel to enable live monitoring.", issues: [], checkedAt: now };
  }
  const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
  try {
    const acct = await fetchJson(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: auth } });
    if (!acct.ok) {
      return { provider: "Twilio", connected: false, reason: `Twilio API returned ${acct.status} — check the credentials.`, issues: [], checkedAt: now };
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
    return {
      provider: "Twilio",
      connected: true,
      numbers,
      detail: `${a.friendly_name ?? "Account"} · status ${a.status ?? "?"}${numbers != null ? ` · ${numbers} number(s)` : ""}`,
      issues,
      checkedAt: now,
    };
  } catch (e) {
    return { provider: "Twilio", connected: false, reason: `Couldn't reach Twilio (${(e as Error).name}).`, issues: [], checkedAt: now };
  }
}

/** Telnyx: phone-number count + any numbers not in an active state. Bearer API key. */
export async function telnyxHealth(): Promise<LineHealth> {
  const now = new Date().toISOString();
  const key = process.env.TELNYX_API_KEY;
  if (!key) {
    return { provider: "Telnyx", connected: false, reason: "Add TELNYX_API_KEY in Vercel to enable live monitoring.", issues: [], checkedAt: now };
  }
  try {
    const res = await fetchJson(`https://api.telnyx.com/v2/phone_numbers?page[size]=250`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      return { provider: "Telnyx", connected: false, reason: `Telnyx API returned ${res.status} — check the API key.`, issues: [], checkedAt: now };
    }
    const body = res.json as { data?: { status?: string; phone_number?: string }[]; meta?: { total_results?: number } };
    const data = body.data ?? [];
    const numbers = body.meta?.total_results ?? data.length;
    const notActive = data.filter((d) => d.status && d.status !== "active");
    const issues: string[] = [];
    if (notActive.length) issues.push(`${notActive.length} Telnyx number(s) not active: ${notActive.slice(0, 5).map((d) => `${d.phone_number ?? "?"} (${d.status})`).join(", ")}`);
    return {
      provider: "Telnyx",
      connected: true,
      numbers,
      detail: `${numbers} number(s)${notActive.length ? ` · ${notActive.length} need attention` : " · all active"}`,
      issues,
      checkedAt: now,
    };
  } catch (e) {
    return { provider: "Telnyx", connected: false, reason: `Couldn't reach Telnyx (${(e as Error).name}).`, issues: [], checkedAt: now };
  }
}

/** Both providers in parallel. */
export async function allLineHealth(): Promise<LineHealth[]> {
  return Promise.all([twilioHealth(), telnyxHealth()]);
}
