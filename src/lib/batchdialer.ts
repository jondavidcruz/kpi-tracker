// Batch Dialer (separate autodialer, not REI Reply) — read-only via an API token
// (X-ApiKey). Used to pull dialer talk time per agent. The base URL + exact call
// endpoint are discovered with the flexible probe below once the key is set.
const BASE = process.env.BATCHDIALER_BASE || "https://api.batchservice.com";

export function batchDialerConfigured(): boolean {
  return Boolean(process.env.BATCHDIALER_API_KEY);
}

export async function bdFetch(path: string, params?: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown; url: string }> {
  const url = new URL(path.startsWith("http") ? path : BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      headers: { "X-ApiKey": process.env.BATCHDIALER_API_KEY || "", Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text.slice(0, 600); }
    return { ok: res.ok, status: res.status, body, url: url.toString() };
  } catch (e) {
    return { ok: false, status: 0, body: String(e), url: url.toString() };
  }
}
