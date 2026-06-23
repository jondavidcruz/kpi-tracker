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

export async function searchConversations(extra?: Record<string, string>) {
  const loc = process.env.REIREPLY_LOCATION_ID ?? "";
  return ghl("/conversations/search", { locationId: loc, limit: "20", ...extra });
}

export async function getMessages(conversationId: string) {
  return ghl(`/conversations/${conversationId}/messages`);
}

/** Pipelines + their stages (id + name) — to map stage moves → Offers/Contracts KPIs. */
export async function getPipelines() {
  const loc = process.env.REIREPLY_LOCATION_ID ?? "";
  return ghl("/opportunities/pipelines", { locationId: loc });
}

/** Opportunities in a pipeline (current stage + assignedTo + last-change date). */
export async function searchOpportunities(pipelineId: string, extra?: Record<string, string>) {
  const loc = process.env.REIREPLY_LOCATION_ID ?? "";
  return ghl("/opportunities/search", { location_id: loc, pipeline_id: pipelineId, limit: "100", ...extra });
}

/** Probe a few recent conversations and report the SHAPE of call messages (no PII)
 *  so we can build the daily aggregation against the real field names. */
export async function probeCallShape(): Promise<unknown> {
  const conv = await searchConversations();
  if (!conv.ok) return { step: "search", status: conv.status, error: conv.body };
  const cb = conv.body as { conversations?: Array<{ id: string; lastMessageType?: string }> };
  const convs = cb?.conversations ?? [];
  const typesSeen = new Set<string>();
  const callSamples: unknown[] = [];
  const callSourcesSeen: Record<string, number> = {}; // e.g. { workflow: 5, app: 3 } → which is the dialer?
  for (const c of convs.slice(0, 12)) {
    const m = await getMessages(c.id);
    if (!m.ok) continue;
    const mb = m.body as { messages?: { messages?: unknown[] } | unknown[] };
    const list: unknown[] = Array.isArray(mb?.messages) ? (mb.messages as unknown[]) : ((mb?.messages as { messages?: unknown[] })?.messages ?? []);
    for (const msg of list) {
      const x = msg as Record<string, unknown>;
      const mt = String(x.messageType ?? x.type ?? "");
      typesSeen.add(mt);
      if (/call/i.test(mt)) {
        const src = `${String(x.source ?? "?")}|${String((x.meta as { call?: { source?: string } } | undefined)?.call?.source ?? "")}`;
        callSourcesSeen[src] = (callSourcesSeen[src] ?? 0) + 1;
        if (callSamples.length < 6) {
          callSamples.push({
            keys: Object.keys(x),
            messageType: x.messageType, type: x.type, direction: x.direction, status: x.status,
            source: x.source, dateAdded: x.dateAdded, userId: x.userId, duration: x.duration, meta: x.meta,
          });
        }
      }
    }
  }
  return { conversationsScanned: convs.length, messageTypesSeen: [...typesSeen], callSourcesSeen, callSamples };
}

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
