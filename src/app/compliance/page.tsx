import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import {
  deriveOperatingStates,
  ruleFor,
  isStricter,
  PLAYBOOKS,
  COMPLIANCE_DISCLAIMER,
} from "@/lib/compliance";
import { allLineHealth, telcoEnvStatus } from "@/lib/telco";
import { getCurrentUser, isOwner } from "@/lib/auth";

export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

export default async function CompliancePage() {
  const [states, health, me] = await Promise.all([deriveOperatingStates(), allLineHealth(), getCurrentUser()]);
  const owner = isOwner(me);
  const env = telcoEnvStatus();
  const anyKeyMissing = !env.twilioSid || !env.twilioToken || !env.telnyx;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">🛡️ Compliance</h1>
        <p className="mt-1 text-sm text-slate-500">
          A2P · SMS · Cold Call · Direct Mail · Email — the rules, the best practices, and a live check on our lines.
        </p>
      </div>

      {/* Legal disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        ⚠️ <strong>Not legal advice.</strong> {COMPLIANCE_DISCLAIMER}
      </div>

      {/* ── Live line health (Twilio + Telnyx) ── */}
      <section>
        <div className="flex items-center justify-between">
          <SectionTitle title="📡 Live line health" subtitle="Twilio + Telnyx, checked live via API" accent="bg-emerald-400" />
          <Link href="/compliance" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">↻ Refresh</Link>
        </div>
        {owner && anyKeyMissing && (
          <div className="mb-3 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
            <div className="font-semibold text-slate-700 dark:text-slate-200">🔑 Keys the live server can see right now:</div>
            <ul className="mt-1.5 space-y-0.5 text-slate-600 dark:text-slate-300">
              <li>{env.twilioSid ? "✅" : "❌"} <code>TWILIO_ACCOUNT_SID</code></li>
              <li>{env.twilioToken ? "✅" : "❌"} <code>TWILIO_AUTH_TOKEN</code></li>
              <li>{env.telnyx ? "✅" : "❌"} <code>TELNYX_API_KEY</code></li>
            </ul>
            <p className="mt-2 text-xs text-slate-500">
              A ❌ means the running deployment isn&apos;t receiving that variable. Fix in Vercel → Settings → Environment Variables:
              set it for the <strong>Production</strong> environment (check the Production box), then <strong>redeploy</strong> — env vars only reach a
              deployment that was built <em>after</em> they were added. This notice disappears once all three are detected.
            </p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {health.map((h) => {
            const ok = h.connected && h.issues.length === 0;
            const tone = !h.connected ? "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900" : ok ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950";
            const dot = !h.connected ? "⚪" : ok ? "🟢" : "🔴";
            return (
              <div key={h.provider} className={`rounded-xl border p-4 ${tone}`}>
                <div className="flex items-center justify-between">
                  <strong className="text-slate-900 dark:text-slate-100">{dot} {h.provider}</strong>
                  <span className="text-[11px] text-slate-400">{timeAgo(h.checkedAt)}</span>
                </div>
                {h.connected ? (
                  <>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{h.detail}</p>
                    {h.a2p && h.a2p.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {h.a2p.map((c, n) => (
                          <span key={n} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.ok ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"}`}>
                            {c.ok ? "✓" : "⚠️"} {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {h.issues.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-red-700 dark:text-red-300">
                        {h.issues.map((i, n) => <li key={n}>⚠️ {i}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">✓ No issues detected</p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">{h.reason}</p>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Number-level answer-rate & spam-flag tracking lives on <Link href="/phone-health" className="underline">Phone Health</Link>. Live status here reads Twilio/Telnyx directly via API.
        </p>
      </section>

      {/* ── Operating footprint + state matrix ── */}
      <section>
        <SectionTitle title="🗺️ Where we operate — state rules" subtitle="Auto-derived from where we source developers/buyers + our deals" accent="bg-sky-400" />
        <div className="mb-3 flex flex-wrap gap-2">
          {states.map((s) => (
            <span key={s.code} className={`rounded-full px-3 py-1 text-xs font-semibold ${isStricter(s.code) ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
              {s.name}{isStricter(s.code) ? " · stricter ⚠️" : ""}{s.hits > 0 ? ` · ${s.hits}` : ""}
            </span>
          ))}
        </div>
        <div className="space-y-3">
          {states.map((s) => {
            const r = ruleFor(s.code);
            return (
              <Card key={s.code} className="p-4">
                <div className="flex items-baseline justify-between">
                  <strong className="text-slate-900 dark:text-slate-100">{s.name} <span className="text-slate-400">({s.code})</span></strong>
                  {isStricter(s.code) && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-950 dark:text-red-200">Stricter than federal</span>}
                </div>
                <dl className="mt-2 space-y-1.5 text-sm">
                  <div><dt className="inline font-semibold text-slate-600 dark:text-slate-300">Call window: </dt><dd className="inline text-slate-600 dark:text-slate-300">{r.callHours}</dd></div>
                  <div><dt className="inline font-semibold text-slate-600 dark:text-slate-300">Call recording: </dt><dd className="inline text-slate-600 dark:text-slate-300">{r.recording}</dd></div>
                  <div>
                    <dt className="font-semibold text-slate-600 dark:text-slate-300">Watch-outs:</dt>
                    <ul className="mt-0.5 list-disc pl-5 text-slate-600 dark:text-slate-300">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                  </div>
                </dl>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ── Channel playbooks ── */}
      <section>
        <SectionTitle title="📚 Channel playbooks" subtitle="Do / don't + copy-paste consent language" accent="bg-violet-400" />
        <div className="space-y-3">
          {PLAYBOOKS.map((p) => (
            <Card key={p.key} className="p-4">
              <div className="flex items-baseline justify-between">
                <strong className="text-slate-900 dark:text-slate-100">{p.emoji} {p.title}</strong>
              </div>
              <p className="mt-0.5 text-xs text-slate-400">{p.law}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-emerald-600">Do</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">{p.dos.map((d, i) => <li key={i}>✅ {d}</li>)}</ul>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-red-500">Don&apos;t</div>
                  <ul className="mt-1 space-y-1 text-sm text-slate-600 dark:text-slate-300">{p.donts.map((d, i) => <li key={i}>🚫 {d}</li>)}</ul>
                </div>
              </div>
              {p.consent && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="text-xs font-semibold text-slate-500">Copy-paste consent / opt-out language</div>
                  <p className="mt-1 font-mono text-[13px] text-slate-700 dark:text-slate-200">{p.consent}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
