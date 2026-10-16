import { db } from "@/lib/db";
import { readCommissionPlans, planForUser, pathToGoal } from "@/lib/commissions";
import { decryptSecret, vaultConfigured } from "@/lib/crypto";

const APP_URL = "https://kpi-tracker-lovat.vercel.app";

// Role → the systems a new hire needs (mirrors the onboarding checklist). `soft`
// is the Software-directory name we try to match for a shared login to include.
type SysLine = { name: string; soft?: string; note: string };
const SYSTEMS: Record<string, SysLine[]> = {
  acquisitions: [
    { name: "War Room", note: "Your login to our CRM — see the sign-in steps above." },
    { name: "Regrid", soft: "Regrid", note: "Land comps / parcel data." },
    { name: "REI AI", soft: "REI AI", note: "Comps (note: this shared login expires Nov 7, 2026)." },
    { name: "Eric Cline Sales Training", soft: "Eric Cline", note: "Complete the sales course at members.theericcline.com, then write your OWN sales script." },
    { name: "Propwire", note: "Comps — free, create your own account at propwire.com." },
    { name: "Redfin / Zillow", note: "Comps — free public sites, no account needed." },
  ],
  dispositions: [
    { name: "War Room", note: "Your login to our CRM — see the sign-in steps above." },
    { name: "Regrid", soft: "Regrid", note: "Land comps / parcel data." },
    { name: "iSpeedToLead", soft: "iSpeedToLead", note: "Lead-speed / disposition tooling." },
    { name: "LinkedIn / Facebook / Craigslist", note: "Buyer outreach + passive marketing — use your own accounts." },
  ],
};

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the role-specific welcome email for a new hire. Includes War Room sign-in,
 *  the systems they need (with shared logins pulled from Software & Logins where
 *  available), and their pay + bonus schedule from the commission plan. */
export async function buildWelcomeEmail(opts: { name: string; position: string; email: string; assessUrl?: string }): Promise<{ subject: string; html: string }> {
  const first = opts.name.trim().split(/\s+/)[0] || "there";
  const role = opts.position === "dispositions" ? "dispositions" : "acquisitions";
  const sys = SYSTEMS[role];

  // shared logins from the Software directory (decrypt the stored secret)
  const software = await db.software.findMany({ where: { active: true } }).catch(() => []);
  const credFor = (softName?: string): { email: string; pw: string; url: string } | null => {
    if (!softName) return null;
    const s = software.find((x) => x.name.toLowerCase().includes(softName.toLowerCase()));
    if (!s) return null;
    let pw = "";
    try { if (s.secret && vaultConfigured()) pw = decryptSecret(s.secret); } catch { /* skip */ }
    return { email: s.loginEmail || "", pw, url: s.url || "" };
  };

  // Behavioral / personality assessment link. We use our OWN in-house DISC
  // assessment (/assess/[token]) — the caller passes the hire's personal token
  // link. Fall back to a stored external link only if no in-house link was made.
  let piUrl = (opts.assessUrl || "").trim();
  if (!piUrl) {
    try { const r = await db.resource.findFirst({ where: { category: "__pi_link__" } }); piUrl = (r?.url || r?.description || "").trim(); } catch { /* none */ }
  }

  // pay + bonus from the commission plan
  const plans = await readCommissionPlans();
  const plan = planForUser(plans, opts.name);

  const sysRows = sys.map((s) => {
    const c = credFor(s.soft);
    const credHtml = c && (c.email || c.pw)
      ? `<div style="margin-top:4px;font-size:13px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px">${c.url ? `🔗 <a href="${esc(c.url)}" style="color:#2563eb">${esc(c.url)}</a><br>` : ""}${c.email ? `👤 ${esc(c.email)}<br>` : ""}${c.pw ? `🔑 ${esc(c.pw)}` : ""}</div>`
      : "";
    return `<li style="margin:8px 0"><b>${esc(s.name)}</b> — ${esc(s.note)}${credHtml}</li>`;
  }).join("");

  const payHtml = plan
    ? `<div style="background:#faf7f0;border-left:4px solid #c9a875;border-radius:8px;padding:12px 14px;margin:12px 0">
         <div style="font-weight:800;color:#0b1f3a;margin-bottom:6px">💵 Your pay &amp; bonus</div>
         ${plan.base ? `<div style="margin:3px 0"><b>Base:</b> ${esc(plan.base)}</div>` : `<div style="margin:3px 0"><b>Base:</b> commission only</div>`}
         <div style="margin:3px 0"><b>Commission:</b> ${esc(plan.structure)}</div>
         <div style="margin:3px 0"><b>Payout:</b> ${esc(plan.payout)}</div>
         <div style="margin:3px 0"><b>Monthly goal:</b> $${plan.goalMonthly.toLocaleString()}</div>
         <div style="margin-top:6px;font-size:13px;color:#475569">${pathToGoal(plan).map((l) => `• ${esc(l)}`).join("<br>")}</div>
       </div>`
    : `<div style="font-size:13px;color:#64748b;margin:10px 0">Your pay &amp; bonus schedule is set up in your signed agreement — ask Jon if you have questions.</div>`;

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1f2937">
    <div style="max-width:640px;margin:0 auto;padding:24px">
      <div style="background:#0b1f3a;color:#fff;border-radius:14px 14px 0 0;padding:22px 24px">
        <div style="font-size:22px;font-weight:800">Welcome to Freedom Offers, ${esc(first)}! 🎉</div>
        <div style="opacity:.75;margin-top:4px;font-size:14px">Everything you need to get started is below. Work top to bottom.</div>
      </div>
      <div style="background:#fff;border-radius:0 0 14px 14px;padding:22px 24px">
        <div style="font-weight:800;color:#0b1f3a">1) Log into the War Room (our CRM)</div>
        <ol style="margin:6px 0 2px;padding-left:18px;font-size:14px;line-height:1.55">
          <li>Go to <a href="${APP_URL}/login" style="color:#2563eb;font-weight:700">${APP_URL}/login</a></li>
          <li>Enter your email: <b>${esc(opts.email)}</b></li>
          <li>You'll get a one-time magic sign-in link by email — click it and you're in.</li>
        </ol>
        <div style="font-size:13px;color:#64748b;margin-bottom:14px">To start, you'll see your <b>training + daily basics</b>. The rest of the War Room unlocks once you're certified.</div>

        <div style="font-weight:800;color:#0b1f3a">2) Your systems &amp; logins</div>
        <ul style="margin:6px 0 10px;padding-left:18px;font-size:14px;line-height:1.5">${sysRows}</ul>

        ${payHtml}

        <div style="font-weight:800;color:#0b1f3a;margin-top:6px">3) Two quick to-dos</div>
        <ul style="margin:6px 0 10px;padding-left:18px;font-size:14px;line-height:1.5">
          <li><b>Take your personality assessment</b> — a short (~6 min) behavioral survey (our in-house Predictive Index) so we put you in your best-fit seat. No login needed.${piUrl ? ` <a href="${esc(piUrl)}" style="color:#2563eb;font-weight:700">Start your assessment →</a>` : " (Jon will send you your personal assessment link.)"}</li>
          <li><b>Need help or have an idea?</b> In the War Room, use <b>Requests</b> (left menu) to flag anything broken or confusing, and <b>AI Champion</b> to drop ideas that improve the system.</li>
        </ul>

        <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:8px;padding:12px 14px;margin:12px 0">
          <div style="font-weight:800;color:#0b1f3a;margin-bottom:6px">📋 Please reply with this info</div>
          <div style="font-size:14px;line-height:1.6">
            So we can set you up and pay you, reply to this email with:
            <ul style="margin:6px 0 0;padding-left:18px">
              <li>Date of birth</li>
              <li>Phone number</li>
              <li>Mailing address (for reward gifts)</li>
              <li><b>How you want commissions wired</b> — <b>Wise</b>, <b>PayPal</b>, or <b>Venmo</b> (pick one) and the account details/email/handle for it.</li>
            </ul>
          </div>
        </div>

        <div style="font-size:13px;color:#64748b;margin-top:14px">Your signed independent-contractor agreement is attached / on file. Questions? Just reply to this email.</div>
      </div>
      <div style="text-align:center;color:#94a3b8;font-size:12px;margin-top:14px">Freedom Offers — veteran-owned land wholesaling</div>
    </div>
  </body></html>`;

  return { subject: `Welcome to Freedom Offers, ${first} — your logins & first steps`, html };
}
