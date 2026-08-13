// Ring buffer of alarms received FROM Twilio/Telnyx (via webhook) — stored as a
// single JSON row in Resource (__telco_alerts__, no migration). The providers POST
// to /api/telco-alert; the compliance + phone-health pages read the buffer; the
// daily cron and the webhook post them to the phone-health Chat.
import { db } from "./db";

export interface TelcoAlert {
  provider: "Twilio" | "Telnyx" | string;
  level: string;   // error | warning | notice
  code?: string;   // provider error code (e.g. 30007, 11200)
  text: string;    // human-readable
  at: string;      // ISO
}

const CAT = "__telco_alerts__";
const MAX = 60;

export async function readTelcoAlerts(): Promise<TelcoAlert[]> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row) return [];
  try {
    const arr = JSON.parse(row.description || "[]") as TelcoAlert[];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export async function pushTelcoAlerts(alerts: TelcoAlert[]): Promise<void> {
  if (alerts.length === 0) return;
  const existing = await readTelcoAlerts();
  const merged = [...alerts, ...existing].slice(0, MAX);
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: JSON.stringify(merged) } });
  else await db.resource.create({ data: { title: "telco-alerts", category: CAT, url: "", description: JSON.stringify(merged) } });
}

/** Best-effort parse of an incoming provider webhook body into TelcoAlert(s). */
export function normalizeIncoming(provider: string, body: Record<string, unknown>, nowIso: string): TelcoAlert[] {
  const p = /telnyx/i.test(provider) ? "Telnyx" : "Twilio";
  // Twilio Debugger webhook: { Sid, Level, PayloadType, Payload:{error_code, more_info}, ... } or form fields.
  if (p === "Twilio") {
    const level = String(body.Level ?? body.level ?? "error").toLowerCase();
    const code = body.error_code ?? body.ErrorCode ?? (body.Payload as { error_code?: string } | undefined)?.error_code;
    const text = String(body.alert_text ?? body.AlertText ?? body.message ?? body.MoreInfo ?? "Twilio alert");
    return [{ provider: p, level, code: code ? String(code) : undefined, text, at: nowIso }];
  }
  // Telnyx webhook: { data: { event_type, payload:{...} } } or { event_type, payload }.
  const data = (body.data ?? body) as { event_type?: string; payload?: Record<string, unknown> };
  const evt = String(data.event_type ?? "telnyx.alert");
  const payload = data.payload ?? {};
  const code = payload.error_code ?? payload.code;
  const text = String(payload.reason ?? payload.message ?? payload.errors ?? evt);
  const level = /fail|error|blocked|undeliver/i.test(`${evt} ${text}`) ? "error" : "notice";
  return [{ provider: "Telnyx", level, code: code ? String(code) : undefined, text: `${evt}: ${text}`, at: nowIso }];
}
