// PandaDoc e-signature integration — source of truth for SIGNED contracts and
// their type (assignment / novation / creative), read-only via an API key.
const BASE = "https://api.pandadoc.com/public/v1";

export function pandadocConfigured(): boolean {
  return Boolean(process.env.PANDADOC_API_KEY);
}

type Res = { ok: boolean; status: number; body: unknown };
async function pd(path: string, params?: Record<string, string>): Promise<Res> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `API-Key ${process.env.PANDADOC_API_KEY}`, Accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

/** Completed documents in a date window (status=2 = document.completed). */
export async function listCompletedDocs(fromISO: string, toISO: string) {
  return pd("/documents", { status: "2", completed_from: fromISO, completed_to: toISO, count: "50", order_by: "date_completed" });
}

export async function getDocDetails(id: string) {
  return pd(`/documents/${id}/details`);
}

/** Probe recent completed docs so we can map template → contract type + creator → rep. */
export async function probeDocs(): Promise<unknown> {
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 90 * 86400000).toISOString();
  const list = await listCompletedDocs(from, to);
  if (!list.ok) return { step: "list", status: list.status, error: list.body };
  const lb = list.body as { results?: Array<{ id: string; name?: string; status?: string; date_completed?: string }> };
  const results = lb?.results ?? [];
  const samples: unknown[] = [];
  for (const d of results.slice(0, 6)) {
    const det = await getDocDetails(d.id);
    const x = (det.ok ? det.body : {}) as Record<string, unknown>;
    samples.push({
      name: d.name, status: d.status, date_completed: d.date_completed,
      template: (x.template as { name?: string } | undefined)?.name ?? x.template,
      created_by: x.created_by, metadata: x.metadata, grand_total: (x.grand_total as { amount?: string } | undefined)?.amount,
      detailKeys: det.ok ? Object.keys(x) : det.status,
    });
  }
  return { completedFound: results.length, samples };
}
