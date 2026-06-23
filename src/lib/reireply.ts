// REI Reply = GoHighLevel white-label. Read-only sync using a Private Integration
// token (REIREPLY_API_KEY) scoped to our location (REIREPLY_LOCATION_ID).
const BASE = "https://services.leadconnectorhq.com";

export function reiReplyConfigured(): boolean {
  return Boolean(process.env.REIREPLY_API_KEY && process.env.REIREPLY_LOCATION_ID);
}

type GhlResult = { ok: boolean; status: number; body: unknown };

async function ghl(path: string, params?: Record<string, string>): Promise<GhlResult> {
  const key = process.env.REIREPLY_API_KEY;
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28", Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

export type CrmUser = { id: string; name: string; email: string };

/** List the CRM users for our location — verifies auth + gives the agent→rep map. */
export async function listCrmUsers(): Promise<{ ok: boolean; status: number; users: CrmUser[]; raw: unknown }> {
  const loc = process.env.REIREPLY_LOCATION_ID ?? "";
  const r = await ghl("/users/", { locationId: loc });
  const b = r.body as { users?: unknown };
  const arr = Array.isArray(b?.users) ? b.users : Array.isArray(r.body) ? (r.body as unknown[]) : [];
  const users: CrmUser[] = arr.map((u) => {
    const x = u as { id?: string; firstName?: string; lastName?: string; name?: string; email?: string };
    return { id: x.id ?? "", name: [x.firstName, x.lastName].filter(Boolean).join(" ") || x.name || "(no name)", email: x.email ?? "" };
  });
  return { ok: r.ok, status: r.status, users, raw: r.ok ? undefined : r.body };
}
