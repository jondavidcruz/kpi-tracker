import { readTelcoAlerts, type TelcoAlert } from "@/lib/telco-alerts";
import { twilioDebuggerAlarms, type LiveAlarm } from "@/lib/telco";

function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/** Recent alarms received from / pulled from Twilio + Telnyx. Shown on both the
 *  Compliance and Phone Health pages so line problems are visible in either place. */
export default async function TelcoAlarms() {
  const [stored, twilioLive] = await Promise.all([readTelcoAlerts(), twilioDebuggerAlarms(12)]);
  // Merge webhook-received + live-pulled, dedupe on text+code, newest first.
  const seen = new Set<string>();
  const all: (TelcoAlert | LiveAlarm)[] = [...twilioLive, ...stored]
    .filter((a) => { const k = `${a.code ?? ""}|${a.text}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 15);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <strong className="text-slate-900 dark:text-slate-100">🚨 Recent line alarms</strong>
        <span className="text-[11px] text-slate-400">Twilio Debugger (live) + provider webhooks</span>
      </div>
      {all.length === 0 ? (
        <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">✓ No alarms. (Point Twilio Debugger + Telnyx webhooks at <code className="text-xs">/api/telco-alert</code> to capture real-time alerts.)</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {all.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span>{a.level === "error" ? "🔴" : a.level === "warning" ? "🟠" : "🔵"}</span>
              <span className="flex-1 text-slate-700 dark:text-slate-200">
                <span className="font-semibold">{a.provider}</span>{a.code ? ` · ${a.code}` : ""} — {a.text}
              </span>
              <span className="shrink-0 text-[11px] text-slate-400">{ago(a.at)} ago</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const DELIVERABILITY_TIPS: { area: string; tips: string[] }[] = [
  {
    area: "Higher call connect rate (Twilio · acquisitions)",
    tips: [
      "Register CNAM / caller ID so your name shows, and enroll numbers in the Free Caller Registry to fight 'Spam Likely'.",
      "Keep STIR/SHAKEN attestation at A — verify your numbers are fully attested with the carrier.",
      "Rotate a pool of local-presence numbers; keep each under ~50–75 dials/day so none gets burned.",
      "Retire + replace any number that gets flagged 'Scam Likely' instead of dialing it harder.",
      "Watch answer rate per number and pause the low performers; warm new numbers up gradually.",
    ],
  },
  {
    area: "SMS deliverability (Telnyx · marketing)",
    tips: [
      "Keep the 10DLC brand VERIFIED and campaign ACTIVE — unregistered A2P gets silently filtered.",
      "Watch for error 30007 (carrier filtered) and 30034 (unregistered) — spikes mean content or registration problems.",
      "Use a branded/dedicated link domain, never public shorteners (bit.ly), which trip spam filters.",
      "Honor STOP instantly and keep opt-out rate low; vary message wording to avoid content fingerprinting.",
      "Stay within throughput limits for your campaign tier; drip sends instead of blasting.",
    ],
  },
];
