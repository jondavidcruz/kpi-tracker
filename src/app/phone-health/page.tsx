import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { db } from "@/lib/db";
import { savePhoneLine, deletePhoneLine, savePhoneSetup } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

const PHONE_LINE_CAT = "__phone_line__"; // reserved Resource category for phone lines
const PHONE_SETUP_CAT = "__phone_setup__"; // reserved Resource category for the setup checklist

// The foundational setup — root-cause fixes. `top3` = the free "start here" trio.
const SETUP_TASKS: { key: string; title: string; detail: string; cost: string; top3?: boolean; link?: { href: string; label: string } }[] = [
  { key: "free_registry", title: "Free Caller Registry", detail: "One free form feeds all three carrier engines (Hiya, TNS, First Orion). Register every Twilio & Telnyx number. Re-register whenever you add one.", cost: "Free · today", top3: true, link: { href: "https://www.freecallerregistry.com", label: "freecallerregistry.com" } },
  { key: "trust_hub", title: "Twilio Trust Hub — Business Profile + SHAKEN/STIR", detail: "You own the Twilio account, so this is unblocked. Top-tier attestation tells the analytics engines you're a legitimate caller. Vetting takes days — start now, it costs nothing.", cost: "Free · start today", top3: true, link: { href: "https://console.twilio.com/us1/account/trust-hub", label: "Twilio Console → Trust Hub" } },
  { key: "pacing", title: "Fix dialer pacing", detail: "Highest actual impact, and free: ≤100 dials per number/day · 8am–9pm seller-local · 30-second rings · 2-week warm-up on new numbers · stable caller ID. Monitoring without this is just watching yourself create flags.", cost: "Free · highest impact", top3: true },
  { key: "monitoring", title: "Reputation monitoring service ($100–200/mo)", detail: "Twilio Voice Integrity, Telnyx Number Reputation, or a third party (Caller ID Reputation / Number Verifier). Third-party works across BOTH Twilio & Telnyx at once — survives the migration decision. Replaces daily manual checking outright. Add in week two to prove the free fixes worked.", cost: "~$100–200/mo", link: { href: "https://calleridreputation.com", label: "calleridreputation.com" } },
  { key: "scrub", title: "Scrub your lists", detail: "Disconnected numbers, wrong numbers, and DNC hits all drag your score down. The cheapest reputation protection there is.", cost: "Cost of data" },
  { key: "tendlc", title: "10DLC approval + text-first", detail: "A text before the call makes the call expected — that beats fixing any label. Both Twilio & Telnyx require 10DLC or business texts get blocked. Highest-leverage item still to unblock.", cost: "~$10/mo + one-time" },
  { key: "three_phone", title: "Three-phone test (monthly / quarterly)", detail: "The only thing that shows literally what a seller sees. Grab AT&T + Verizon + T-Mobile phones and call from each number. Once monitoring is live you only spot-test the DIDs the dashboard already flagged — ~5, not 40.", cost: "Free · ongoing" },
];
const SETUP_STATUS: Record<string, { label: string; cls: string }> = {
  done: { label: "✓ Done", cls: "bg-emerald-100 text-emerald-700" },
  doing: { label: "In progress", cls: "bg-amber-100 text-amber-800" },
  todo: { label: "To do", cls: "bg-slate-100 text-slate-500" },
};

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";

type Meta = { provider: string; label: string; registered: boolean; lastTested: string; att: string; verizon: string; tmobile: string; answerRate: number | null; notes: string };
type Line = { id: string; number: string; meta: Meta };

function health(m: Meta): { label: string; cls: string } {
  const carriers = [m.att, m.verizon, m.tmobile];
  if (carriers.includes("flagged")) return { label: "⚠️ Flagged", cls: "bg-red-100 text-red-700" };
  if (!m.registered) return { label: "Not registered", cls: "bg-amber-100 text-amber-800" };
  if (m.answerRate != null && m.answerRate < 5) return { label: "Low answer rate", cls: "bg-amber-100 text-amber-800" };
  if (carriers.includes("unknown")) return { label: "Test needed", cls: "bg-slate-100 text-slate-600" };
  return { label: "✓ Healthy", cls: "bg-emerald-100 text-emerald-700" };
}
const CARRIER_OPTS = [["unknown", "—"], ["clean", "Clean"], ["flagged", "Flagged"]] as const;

export default async function PhoneHealthPage({ searchParams }: { searchParams: Promise<{ saved?: string; err?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const manager = isManager(me);
  const sp = await searchParams;

  // Numbers live in the Resource table under a reserved category — degrade gracefully
  // if the store is briefly unreachable rather than crashing the playbook.
  let lines: Line[] = [];
  let storeOk = true;
  try {
    const rows = await db.resource.findMany({ where: { category: PHONE_LINE_CAT }, orderBy: { sortOrder: "asc" } });
    lines = rows.map((r) => {
      let meta: Meta = { provider: "twilio", label: "", registered: false, lastTested: "", att: "unknown", verizon: "unknown", tmobile: "unknown", answerRate: null, notes: "" };
      try { meta = { ...meta, ...JSON.parse(r.description || "{}") }; } catch {}
      return { id: r.id, number: r.title, meta };
    });
  } catch { storeOk = false; }

  // Setup checklist statuses (one JSON row)
  let setupStatus: Record<string, string> = {};
  try {
    const row = await db.resource.findFirst({ where: { category: PHONE_SETUP_CAT } });
    if (row) setupStatus = JSON.parse(row.description || "{}");
  } catch {}
  const setupDone = SETUP_TASKS.filter((t) => setupStatus[t.key] === "done").length;

  const flaggedCount = lines.filter((l) => health(l.meta).label.startsWith("⚠️")).length;
  const unregistered = lines.filter((l) => !l.meta.registered).length;
  const healthy = lines.filter((l) => health(l.meta).label.startsWith("✓")).length;

  return (
    <div className="space-y-6">
      <SectionTitle title="📞 Phone Health — Answer-Rate Playbook" subtitle="Keep every Twilio & Telnyx number out of “Spam Likely” so sellers actually pick up. Register, dial clean, monitor, dispute." accent="bg-brand-gold" />

      {/* At-a-glance */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 text-center"><div className="text-3xl font-extrabold text-slate-800">{lines.length}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Numbers tracked</div></Card>
        <Card className="p-4 text-center"><div className={`text-3xl font-extrabold ${healthy === lines.length && lines.length ? "text-emerald-600" : "text-slate-800"}`}>{healthy}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Healthy</div></Card>
        <Card className="p-4 text-center"><div className={`text-3xl font-extrabold ${flaggedCount ? "text-red-600" : "text-slate-800"}`}>{flaggedCount}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Flagged</div></Card>
        <Card className="p-4 text-center"><div className={`text-3xl font-extrabold ${unregistered ? "text-amber-600" : "text-slate-800"}`}>{unregistered}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Not registered</div></Card>
      </div>

      {/* The 60-second why */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-slate-800">🤖 Why numbers get flagged — it’s robots, not people</h2>
        <p className="mt-1 text-[13px] text-slate-600">Each carrier hires a company to score every number that calls it — like a credit score for your phone number. The three don’t talk to each other, so you have to stay clean on all three. <b>~80% of unidentified calls go unanswered.</b></p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[["AT&T", "Hiya"], ["Verizon", "TNS"], ["T-Mobile", "First Orion"]].map(([c, r]) => (
            <div key={c} className="rounded-lg bg-slate-50 p-3 text-center ring-1 ring-slate-200"><div className="font-bold text-slate-800">{c}</div><div className="text-[11px] text-slate-500">scored by {r}</div></div>
          ))}
        </div>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">⚠️ “Verified” (STIR/SHAKEN) proves <i>who</i> is calling, not <i>how you behave</i>. Verified numbers still get flagged. And there is <b>no master whitelist</b> — anyone charging you to “whitelist” numbers is a scam. Registration is always free.</p>
      </Card>

      {/* ── Foundational setup checklist ─────────────────────────── */}
      <div id="setup" className="scroll-mt-4">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">🧭 Foundational setup — attack the root cause</h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{setupDone}/{SETUP_TASKS.length} done</span>
          </div>
          <p className="mt-1 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800"><b>If you only do three things:</b> Free registry → Trust Hub + SHAKEN/STIR → dialer pacing. All three are free, all three attack the root cause, and together they move your connect rate more than any subscription. Add monitoring in week two to prove it worked.</p>
          <div className="mt-3 space-y-2">
            {SETUP_TASKS.map((t) => {
              const st = setupStatus[t.key] === "done" ? "done" : setupStatus[t.key] === "doing" ? "doing" : "todo";
              const s = SETUP_STATUS[st];
              return (
                <div key={t.key} className={`rounded-xl border p-3 ${st === "done" ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-800">{t.title}</span>
                        {t.top3 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">⭐ Start here</span>}
                        <span className="text-[11px] font-semibold text-slate-400">{t.cost}</span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-slate-600">{t.detail}</p>
                      {t.link && <a href={t.link.href} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] font-semibold text-sky-700 hover:underline">{t.link.label} →</a>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>
                  </div>
                  {manager && (
                    <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
                      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Set status:</span>
                      {(["todo", "doing", "done"] as const).map((v) => (
                        <form key={v} action={savePhoneSetup}>
                          <input type="hidden" name="key" value={t.key} />
                          <input type="hidden" name="status" value={v} />
                          <button className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${st === v ? "bg-brand-navy text-white" : "text-slate-500 hover:bg-slate-100"}`}>{SETUP_STATUS[v].label}</button>
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* The plays */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-800">✅ Register every number (free · do this first)</h2>
          <p className="mt-1 text-[13px] text-slate-600">One form feeds all three carrier engines. You said you just did this — keep it current.</p>
          <a href="https://www.freecallerregistry.com" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700">freecallerregistry.com →</a>
          <ul className="mt-2 space-y-1 text-[12px] text-slate-600">
            <li>• Use your real <b>legal business name</b> (that’s what shows on caller ID).</li>
            <li>• Enter <b>every</b> Twilio & Telnyx number you dial or text from.</li>
            <li>• Takes ~2 business days to confirm. <b>Re-register whenever you add a number.</b></li>
            <li>• Texting? Both Twilio & Telnyx require <b>10DLC registration</b> or business texts get blocked.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-800">📵 Already flagged? Dispute it (free)</h2>
          <p className="mt-1 text-[13px] text-slate-600">Go straight to each carrier’s engine. Fix behavior first (rules below) or the flag comes back.</p>
          <div className="mt-2 space-y-1.5 text-[12px]">
            <a href="https://calltransparency.com" target="_blank" rel="noopener noreferrer" className="block font-semibold text-sky-700 hover:underline">T-Mobile → calltransparency.com</a>
            <a href="https://www.reportarobocall.com" target="_blank" rel="noopener noreferrer" className="block font-semibold text-sky-700 hover:underline">Verizon → reportarobocall.com (use “request review”)</a>
            <a href="https://hiyahelp.zendesk.com" target="_blank" rel="noopener noreferrer" className="block font-semibold text-sky-700 hover:underline">AT&T → hiyahelp.zendesk.com (submit a ticket)</a>
            <a href="https://calleridreputation.com" target="_blank" rel="noopener noreferrer" className="block font-semibold text-slate-500 hover:underline">Monitor across all carriers (paid) → calleridreputation.com</a>
          </div>
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-700">🚨 Early warning: if answer rate suddenly drops <b>under ~5%</b>, test that number the <b>same day</b> — don’t wait and hope.</p>
        </Card>
      </div>

      {/* Dial like a pro — the 6 rules */}
      <Card className="p-5">
        <h2 className="text-sm font-bold text-slate-800">🎯 Dial like a pro — the 6 rules the robots grade you on</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            ["≤ 100 / day", "Cap dials per number", "Sweet spot 50–100/number/day. Need more volume? Add numbers — don’t push one harder."],
            ["8am–9pm", "Seller’s local time", "Calls outside that window hurt your score — and it’s the law. Set the dialer’s time-zone guard."],
            ["Ring 30 sec", "Let it ring 5–6 rings", "One-ring hang-ups are classic robocaller behavior. The robots notice."],
            ["2 weeks", "Warm up new numbers", "Start a fresh number ~20 calls/day and build slowly. Day-one blasting = day-one flags."],
            ["Keep ID steady", "Stop rotating", "Rapid caller-ID rotation is now itself a spam signal. Stability wins."],
            ["Scrub the list", "0 junk", "Disconnected, wrong, and DNC numbers all tank your score. Clean data is cheap insurance."],
          ].map(([big, t, d]) => (
            <div key={t} className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
              <div className="text-sm font-extrabold text-brand-navy">{big}</div>
              <div className="text-[12px] font-bold text-slate-700">{t}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">{d}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Win before the label matters + cheat sheet */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-800">⚡ Win before the label matters</h2>
          <ul className="mt-2 space-y-1.5 text-[12px] text-slate-600">
            <li>• <b>5-minute rule:</b> call new leads within 5 min — odds of reaching them drop ~100× between minute 5 and 30.</li>
            <li>• <b>Text → then call:</b> “Hi John, it’s Mike — you asked about selling 123 Main St, calling you in a minute.” Now the call is <i>expected</i>.</li>
            <li>• <b>Answer & call back fast:</b> every inbound you answer also boosts that number’s score.</li>
            <li>• <b>7+ touches over 2 weeks:</b> most contracts sign after touch 4 — when everyone else quit.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-600">Do</div>
              <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                <li>✓ Register every number</li>
                <li>✓ Test what sellers see, monthly</li>
                <li>✓ ≤100 calls/number/day</li>
                <li>✓ Warm up new numbers 2 wks</li>
                <li>✓ Text first, call within 5 min</li>
                <li>✓ Let it ring 30 sec</li>
                <li>✓ 8am–9pm local · scrub DNC</li>
              </ul>
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-red-600">Don’t</div>
              <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                <li>✕ Pay to “whitelist” (fake)</li>
                <li>✕ Blast 500 dials from one number</li>
                <li>✕ Rotate caller IDs all day</li>
                <li>✕ Hang up after one ring</li>
                <li>✕ Keep dialing a flagged number</li>
                <li>✕ Text from unregistered numbers</li>
                <li>✕ Ignore an answer-rate drop</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Number tracker ─────────────────────────────────────────── */}
      <div id="tracker" className="scroll-mt-4">
        <SectionTitle title="📇 Our numbers — health tracker" subtitle="Every Twilio & Telnyx number, its registration + per-carrier status, and answer rate. Test monthly and log what sellers see." accent="bg-brand-navy" />
      </div>
      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.err && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">{sp.err}</div>}
      {!storeOk && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">The number tracker store is briefly unavailable — the playbook above still works. If this persists, tell Jon.</div>}

      {lines.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2">Number</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Registered</th><th className="px-3 py-2">AT&T</th><th className="px-3 py-2">Verizon</th><th className="px-3 py-2">T-Mobile</th><th className="px-3 py-2">Answer %</th><th className="px-3 py-2">Tested</th><th className="px-3 py-2">Health</th>{manager && <th className="px-3 py-2" />}
            </tr></thead>
            <tbody>
              {lines.map((l) => {
                const h = health(l.meta);
                const cell = (v: string) => v === "flagged" ? <span className="font-bold text-red-600">Flagged</span> : v === "clean" ? <span className="text-emerald-600">Clean</span> : <span className="text-slate-400">—</span>;
                return (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-800">{l.number}{l.meta.label && <span className="ml-1 text-[11px] font-normal text-slate-400">{l.meta.label}</span>}</td>
                    <td className="px-3 py-2 capitalize text-slate-600">{l.meta.provider}</td>
                    <td className="px-3 py-2">{l.meta.registered ? <span className="text-emerald-600">✓</span> : <span className="text-amber-600">No</span>}</td>
                    <td className="px-3 py-2">{cell(l.meta.att)}</td>
                    <td className="px-3 py-2">{cell(l.meta.verizon)}</td>
                    <td className="px-3 py-2">{cell(l.meta.tmobile)}</td>
                    <td className="px-3 py-2 tabular-nums text-slate-600">{l.meta.answerRate != null ? `${l.meta.answerRate}%` : "—"}</td>
                    <td className="px-3 py-2 text-[12px] text-slate-500">{l.meta.lastTested || "—"}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${h.cls}`}>{h.label}</span></td>
                    {manager && <td className="px-3 py-2"><form action={deletePhoneLine}><input type="hidden" name="id" value={l.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : storeOk ? (
        <Card className="p-4 text-sm text-slate-400">No numbers tracked yet{manager ? " — add your first one below." : "."}</Card>
      ) : null}

      {manager && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">➕ Add / update a number</h3>
          <form action={savePhoneLine} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <label className="sm:col-span-3"><span className={labelCls}>Number</span><input name="number" placeholder="+1 813-555-0148" required className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Provider</span><select name="provider" defaultValue="twilio" className={inputCls}><option value="twilio">Twilio</option><option value="telnyx">Telnyx</option></select></label>
            <label className="sm:col-span-3"><span className={labelCls}>Label (optional)</span><input name="label" placeholder="Acquisitions line 1" className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Answer %</span><input name="answerRate" type="number" min="0" max="100" step="0.1" placeholder="e.g. 12" className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Last tested</span><input name="lastTested" type="date" className={inputCls} /></label>
            <label className="sm:col-span-3"><span className={labelCls}>AT&amp;T (Hiya)</span><select name="att" defaultValue="unknown" className={inputCls}>{CARRIER_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
            <label className="sm:col-span-3"><span className={labelCls}>Verizon (TNS)</span><select name="verizon" defaultValue="unknown" className={inputCls}>{CARRIER_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
            <label className="sm:col-span-3"><span className={labelCls}>T-Mobile (First Orion)</span><select name="tmobile" defaultValue="unknown" className={inputCls}>{CARRIER_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
            <label className="flex items-end gap-2 sm:col-span-3"><input type="checkbox" name="registered" className="h-4 w-4" /> <span className="text-sm text-slate-600">Registered at freecallerregistry</span></label>
            <label className="sm:col-span-9"><span className={labelCls}>Notes</span><input name="notes" placeholder="e.g. warming up — 20/day until Aug 4" className={inputCls} /></label>
            <div className="sm:col-span-3 flex items-end"><button className="w-full rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save number</button></div>
          </form>
          <p className="mt-1.5 text-[11px] text-slate-400">To update a number, remove it and re-add — or tell me and I’ll add inline editing.</p>
        </Card>
      )}

      <p className="text-[11px] text-slate-400">Source: iSpeedToLead “Answer-Rate Playbook.” Stats are directional (Hiya 2025 State of the Call, MIT lead-response study, Velocify). Always follow TCPA + Do-Not-Call rules. <Link href="/scripts" className="underline">Scripts</Link> · <Link href="/playbooks" className="underline">Playbooks</Link></p>
    </div>
  );
}
