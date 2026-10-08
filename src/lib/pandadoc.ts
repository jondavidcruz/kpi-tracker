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

async function pdPost(path: string, payload: object): Promise<Res> {
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { Authorization: `API-Key ${process.env.PANDADOC_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const text = await res.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

// Jon's two offer contracts (2026-10-07). Overridable via env without a deploy.
export const PANDADOC_TEMPLATES: Record<string, { id: string; label: string }> = {
  cash: { id: process.env.PANDADOC_TEMPLATE_CASH || "bwoowbYKoRiKecHdhWYZyJ", label: "Cash offer (quick close, 30–60 days)" },
  novation: { id: process.env.PANDADOC_TEMPLATE_NOVATION || "TeYMu3S3BYrzLbtX5dXiLA", label: "Novation offer (disclosures to list, 90–180 days)" },
};

/** Draft a contract from a template (GHL-parity: auto-draft when a lead hits
 * the offer stage — cash vs novation chosen by tag or button). Doc stays a
 * DRAFT — the rep reviews and sends from PandaDoc. Returns {id} on success. */
export async function createOfferDraft(o: { name: string; recipientEmail: string; recipientName: string; tokens: Record<string, string>; metadata?: Record<string, string>; templateId?: string }): Promise<{ id?: string; error?: string }> {
  const tpl = o.templateId || process.env.PANDADOC_TEMPLATE_ID || PANDADOC_TEMPLATES.cash.id;
  if (!tpl) return { error: "no PandaDoc template configured" };
  const [first, ...rest] = o.recipientName.trim().split(/\s+/);
  // The templates use fillable FIELDS (not {{tokens}}), so pre-fill both ways:
  // read the template's field names once and fuzzy-match Jon's 5 essentials.
  const fields: Record<string, { value: string }> = {};
  try {
    const det = await getTemplateDetails(tpl);
    const db2 = det.body as { fields?: Array<{ field_id?: string; merge_field?: string; name?: string }> };
    const want: Array<[RegExp, string]> = [
      [/apn/i, o.tokens["APN"] ?? ""],
      [/address|property/i, o.tokens["Property.Address"] ?? ""],
      [/net|amount|price|sum/i, o.tokens["Seller.Net"] ?? ""],
      [/name|seller|printed/i, o.tokens["Seller.Name"] ?? ""],
    ];
    for (const f of db2.fields ?? []) {
      const key = f.merge_field || f.field_id || "";
      const label = `${f.name ?? ""} ${key}`;
      if (!key || fields[key]) continue;
      for (const [rx, val] of want) if (val && rx.test(label)) { fields[key] = { value: val }; break; }
    }
  } catch { /* fields stay empty — tokens still apply */ }
  const r = await pdPost("/documents", {
    name: o.name.slice(0, 120),
    template_uuid: tpl,
    recipients: [{ email: o.recipientEmail || "unknown@freedom-offers.com", first_name: first || "Seller", last_name: rest.join(" ") || "-", role: "Seller" }],
    tokens: Object.entries(o.tokens).map(([name, value]) => ({ name, value })),
    ...(Object.keys(fields).length ? { fields } : {}),
    metadata: o.metadata ?? {},
  });
  if (!r.ok) return { error: `PandaDoc ${r.status}: ${JSON.stringify(r.body).slice(0, 160)}` };
  return { id: (r.body as { id?: string }).id };
}

/** Download a document's signed PDF (binary). */
export async function downloadDocPdf(id: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(`${BASE}/documents/${id}/download`, {
      headers: { Authorization: `API-Key ${process.env.PANDADOC_API_KEY}` }, cache: "no-store",
    });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

/** Completed documents in a date window (status=2 = document.completed). */
export async function listCompletedDocs(fromISO: string, toISO: string) {
  return pd("/documents", { status: "2", completed_from: fromISO, completed_to: toISO, count: "50", order_by: "date_completed" });
}

export async function getDocDetails(id: string) {
  return pd(`/documents/${id}/details`);
}

/** Template details — shows the fillable fields' names/merge-fields so the
 * draft call can pre-fill Jon's 5 (address, APN, net amount, seller name). */
export async function getTemplateDetails(id: string) {
  return pd(`/templates/${id}/details`);
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
