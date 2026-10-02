// Direct REI — the team's other daily CRM/dialer (directrei.com). Their API
// covers contacts / campaigns / deals (NO call-log endpoints — call analytics
// stay a CSV-import job). Key: Direct REI → Settings → API & Zapier →
// + Create API key → paste into Vercel as DIRECTREI_API_KEY.
// Rate limit: 120 req/min/account (429 + Retry-After over it).
const BASE = process.env.DIRECTREI_API_BASE || "https://vrgnjfatqasljgzrhyub.supabase.co/functions/v1/api/v1";

export function directReiConfigured(): boolean {
  return Boolean(process.env.DIRECTREI_API_KEY);
}

type DreiResult = { ok: boolean; status: number; body: unknown };

async function drei(path: string, params?: Record<string, string>): Promise<DreiResult> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${process.env.DIRECTREI_API_KEY}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

/** Key check — /me returns the account name + plan (what Zapier tests call too). */
export async function directReiWhoami() { return drei("/me"); }

export async function directReiContacts(params?: Record<string, string>) { return drei("/contacts", params); }
export async function directReiCampaigns() { return drei("/campaigns"); }
export async function directReiDeals() { return drei("/deals"); }
