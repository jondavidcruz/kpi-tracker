// Weekly team KPI email — full team last-week numbers by role + an Irish focus
// block. Sent Monday morning to the configured weekly recipients.
import { db } from "./db";
import {
  getActiveReps,
  getKpis,
  getRangeSums,
  getAllTargets,
  resolveGoalWith,
  getSettings,
} from "./data";
import { lastWeekRange, datesInRange, friendlyDate } from "./date";
import { formatValue, type Unit } from "./format";
import { statusVsGoal } from "./kpi";
import { POSITIONS, positionLabel, secondaryPositionOf } from "./roles";
import { findPipCandidates, PIP_CONSECUTIVE_MISSES } from "./pip";
import { sendEmail, getChannelConfig } from "./notify";
import { reasonLabel } from "./alert-resolution";
import { APP_URL } from "./site";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build + send the weekly team KPI email. Returns true if delivered. */
export async function sendWeeklyTeamEmail(today: string): Promise<boolean> {
  const wk = lastWeekRange(today);
  const [reps, perRep, sums, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getRangeSums(wk.start, wk.end),
    getAllTargets(),
  ]);
  const month = wk.start.slice(0, 7);
  const workdays = datesInRange(wk.start, wk.end).filter((d) => {
    const dow = new Date(d + "T00:00:00Z").getUTCDay();
    return dow >= 1 && dow <= 5;
  }).length;

  // Per-rep weekly entries (for reliability counts).
  const entries = await db.entry.findMany({
    where: { date: { gte: wk.start, lte: wk.end } },
  });
  const daysActiveByUser = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.userId) continue;
    if (!daysActiveByUser.has(e.userId)) daysActiveByUser.set(e.userId, new Set());
    daysActiveByUser.get(e.userId)!.add(e.date);
  }

  // ---- Role tables ----
  const roleSections = POSITIONS.map((pos) => {
    const roleReps = reps.filter((r) => r.position === pos.key);
    const roleKpis = perRep.filter((k) => k.roleKey === pos.key);
    if (roleReps.length === 0) return "";

    const headCells = roleKpis.map((k) => `<th style="padding:6px 8px;text-align:center;font-size:12px;color:#475569;">${esc(k.emoji)} ${esc(k.name)}</th>`).join("");
    const rows = roleReps
      .map((rep) => {
        const cells = roleKpis
          .map((k) => {
            const total = sums.get(`${k.id}|${rep.id}`) ?? 0;
            return `<td style="padding:6px 8px;text-align:center;font-variant-numeric:tabular-nums;">${formatValue(k.unit as Unit, total)}</td>`;
          })
          .join("");
        const active = daysActiveByUser.get(rep.id)?.size ?? 0;
        return `<tr style="border-top:1px solid #eef2f7;"><td style="padding:6px 8px;font-weight:600;color:#0b1f3a;">${esc(rep.name)} <span style="color:#94a3b8;font-weight:400;">(${active}/${workdays}d)</span></td>${cells}</tr>`;
      })
      .join("");

    return `<h3 style="margin:18px 0 6px;color:#0b1f3a;">${esc(pos.emoji)} ${esc(pos.label)}</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <thead><tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;font-size:12px;color:#475569;">Rep (days worked)</th>${headCells}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join("");

  // Top reason KPIs were missed last week (from resolved-alert reason tags),
  // excluding auto-recovered. Tells you if misses are a leads/tech/effort thing.
  const reasonRows = await db.alert.groupBy({
    by: ["resolutionCategory"],
    where: {
      status: "resolved",
      resolutionCategory: { notIn: ["recovered", ""] },
      date: { gte: wk.start, lte: wk.end },
    },
    _count: { _all: true },
  });
  const topReason = reasonRows
    .filter((r) => r.resolutionCategory)
    .sort((a, b) => b._count._all - a._count._all)[0];
  const reasonBlock = topReason
    ? `<p style="margin:14px 0 0;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;color:#92400e;font-size:13px;">
        <strong>Top reason for missed KPIs last week:</strong> ${esc(reasonLabel(topReason.resolutionCategory))} (${topReason._count._all}). ${topReason.resolutionCategory === "leads" ? "Supply problem — consider more lead spend, not just coaching." : topReason.resolutionCategory === "tech" ? "Mostly tech/internet — worth fixing at the source." : "Coachable — focus 1:1 time here."}
      </p>`
    : "";

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;">
    <h1 style="color:#0b1f3a;">📊 Freedom Offers Weekly Team KPIs</h1>
    <p style="color:#64748b;">Week of ${esc(wk.label)} · totals per rep (and days worked Mon–Fri).</p>
    ${reasonBlock}
    ${roleSections}
    <p style="margin-top:20px;font-size:12px;color:#94a3b8;">Live dashboard: ${APP_URL}/report</p>
  </div>`;

  // Weekly email has its own recipient list (you + Marie), separate from the
  // daily-alert recipients. Falls back to the alert recipients if unset.
  const settings = await getSettings();
  const cfg = await getChannelConfig();
  const weeklyList = (settings.weeklyEmailRecipients || "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const weeklyCfg = weeklyList.length ? { ...cfg, emailRecipients: weeklyList } : cfg;

  return sendEmail(`📊 Weekly Team KPIs, week of ${wk.label}`, html, weeklyCfg);
}

/** Resolve the recipient config for admin reports (weekly + daily review). */
async function reportCfg() {
  const settings = await getSettings();
  const cfg = await getChannelConfig();
  const list = (settings.weeklyEmailRecipients || "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? { ...cfg, emailRecipients: list } : cfg;
}

/** End-of-day team performance review — full per-rep block for TODAY.
 *  Sent on the post-cutoff (6:30pm) weekday cron to the admin recipients. */
export async function sendDailyTeamReview(date: string): Promise<boolean> {
  const [reps, perRep, targets] = await Promise.all([
    getActiveReps(),
    getKpis({ scope: "per_rep", computed: false }),
    getAllTargets(),
  ]);
  const month = date.slice(0, 7);

  // Today's entries per rep.
  const entries = await db.entry.findMany({ where: { date } });
  const valByUserKpi = new Map<string, number>();
  for (const e of entries) if (e.userId) valByUserKpi.set(`${e.userId}|${e.kpiId}`, e.value);

  // Justifications (why targets were missed) + the day's deal outcomes, so this
  // single end-of-day email tells Jon: what was hit, what wasn't and WHY, plus
  // the end results — no separate justification/deal emails needed.
  const [todaysAlerts, signedToday, closedToday] = await Promise.all([
    db.alert.findMany({ where: { date, status: { in: ["open", "ack", "resolved"] } }, include: { kpi: true, user: true }, orderBy: { severity: "asc" } }),
    db.deal.findMany({ where: { contractDate: date } }),
    db.deal.findMany({ where: { soldDate: date } }),
  ]);

  // Running met/missed tally across every goal-bearing KPI on the scorecard.
  const tally = { hit: 0, miss: 0, close: 0, none: 0 };

  const repBlocks = reps
    .map((rep) => {
      // Hybrids (Michelle/Sharyn): secondary-role KPIs appear ONLY when they
      // actually logged something there today — no "—" noise, no judgment.
      const secRole = secondaryPositionOf(rep);
      const repKpis = [
        ...perRep.filter((k) => k.roleKey === rep.position),
        ...(rep.tracksInternet ? perRep.filter((k) => k.roleKey === "internet") : []),
        ...(secRole ? perRep.filter((k) => k.roleKey === secRole && valByUserKpi.has(`${rep.id}|${k.id}`)) : []),
      ];
      if (repKpis.length === 0) return ""; // owner / unassigned (Jon) — not on a scorecard
      const logged = repKpis.some((k) => valByUserKpi.has(`${rep.id}|${k.id}`));

      const rows = repKpis
        .map((k) => {
          const has = valByUserKpi.has(`${rep.id}|${k.id}`);
          const val = valByUserKpi.get(`${rep.id}|${k.id}`) ?? 0;
          const goal = resolveGoalWith(targets, k, rep.id, month);
          const status = has ? statusVsGoal(k.goalKind, val, goal) : "none";
          // Only tally KPIs that actually carry a goal (skip tracked/activity metrics).
          if (goal !== null && k.goalKind !== "tracked") tally[status as keyof typeof tally]++;
          const color = status === "hit" ? "#047857" : status === "close" ? "#b45309" : status === "miss" ? "#b91c1c" : "#94a3b8";
          const goalStr = goal === null || k.goalKind === "tracked" ? "" : ` <span style="color:#94a3b8;">/ ${formatValue(k.unit as Unit, goal)}</span>`;
          return `<tr><td style="padding:3px 8px;color:#334155;">${esc(k.emoji)} ${esc(k.name)}</td>
            <td style="padding:3px 8px;text-align:right;font-weight:600;color:${color};font-variant-numeric:tabular-nums;">${has ? formatValue(k.unit as Unit, val) : "—"}${goalStr}</td></tr>`;
        })
        .join("");

      const header = logged
        ? `<span style="color:#047857;">✓ logged</span>`
        : `<span style="color:#b91c1c;">⚠️ no entry today</span>`;

      return `<div style="margin:0 0 14px;padding:12px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;">
          <strong style="color:#0b1f3a;">${esc(rep.name)}</strong>
          <span style="font-size:12px;">${esc(positionLabel(rep.position))} · ${header}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:6px;">${rows}</table>
      </div>`;
    })
    .join("");

  // PIP flags: anyone who just hit the consecutive-miss threshold.
  const candidates = await findPipCandidates(date);
  const pipBlock = candidates.length
    ? `<div style="margin-top:18px;padding:14px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <h2 style="margin:0 0 6px;color:#b91c1c;">🎯 Flagged for a Performance Plan (${candidates.length})</h2>
        <ul style="margin:0;padding-left:20px;color:#334155;font-size:13px;">
          ${candidates.map((c) => `<li><strong>${esc(c.userName)}</strong>: ${esc(c.kpiName)} below goal ${PIP_CONSECUTIVE_MISSES} days straight.</li>`).join("")}
        </ul>
        <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Open a documented plan → ${APP_URL}/pip</p>
      </div>`
    : "";

  // ---- Top-line: were the numbers met? ----
  const goaled = tally.hit + tally.miss + tally.close + tally.none;
  const metAll = goaled > 0 && tally.miss === 0 && tally.none === 0;
  const summaryTone = metAll ? "#047857" : tally.miss > 0 ? "#b91c1c" : "#b45309";
  const summaryLine = goaled === 0
    ? "No goal-bearing KPIs on today's scorecard."
    : metAll
      ? `✅ All ${goaled} tracked targets met today — clean day.`
      : `${tally.hit} hit · ${tally.miss} missed · ${tally.close} close · ${tally.none} not entered (of ${goaled}).`;
  const summaryStrip = `<div style="margin:0 0 16px;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-left:5px solid ${summaryTone};border-radius:10px;">
    <div style="font-weight:800;font-size:16px;color:${summaryTone};">${summaryLine}</div>
  </div>`;

  // ---- Why targets were missed (justifications logged in Alerts) ----
  const justified = todaysAlerts.filter((a) => (a.status === "resolved") && (a.resolutionNote || a.correctiveAction));
  const openMoney = todaysAlerts.filter((a) => a.status !== "resolved" && a.severity === "hard");
  const whyRows = [
    ...justified.map((a) => {
      const who = a.user?.name ? `${esc(a.user.name)} · ` : "";
      const reason = (a.resolutionNote || a.correctiveAction || "").trim();
      const cat = a.resolutionCategory ? `${esc(reasonLabel(a.resolutionCategory))}: ` : "";
      return `<li style="margin:4px 0;color:#334155;">✅ ${who}${esc(a.kpi.emoji)} ${esc(a.kpi.name)} — <em style="color:#475569;">${cat}${esc(reason)}</em></li>`;
    }),
    ...openMoney.map((a) => {
      const who = a.user?.name ? `${esc(a.user.name)} · ` : "";
      return `<li style="margin:4px 0;color:#b91c1c;">🔴 ${who}${esc(a.kpi.emoji)} ${esc(a.kpi.name)} — <em>reason pending — justify in Alerts</em></li>`;
    }),
  ].join("");
  const whyBlock = whyRows
    ? `<div style="margin:18px 0 0;padding:14px 16px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
        <h2 style="margin:0 0 6px;color:#0b1f3a;font-size:16px;">Why targets were missed</h2>
        <ul style="margin:0;padding-left:20px;font-size:13px;">${whyRows}</ul>
      </div>`
    : "";

  // ---- End results: the day's deal outcomes ----
  const usd = (n: number | null | undefined) => (n == null ? "" : `$${Math.round(n).toLocaleString()}`);
  const closedRevenue = closedToday.reduce((s, d) => s + (d.assignmentFee ?? 0), 0);
  const resultRows = [
    ...closedToday.map((d) => `<li style="margin:4px 0;color:#047857;">🏆 <strong>Closed:</strong> ${esc(d.address)}${d.assignmentFee ? ` — ${usd(d.assignmentFee)} fee` : ""}${d.assignedTo ? ` · ${esc(d.assignedTo)}` : ""}</li>`),
    ...signedToday.map((d) => `<li style="margin:4px 0;color:#0369a1;">📝 <strong>Under contract:</strong> ${esc(d.address)}${d.contractPrice ? ` — ${usd(d.contractPrice)}` : ""}${d.assignedTo ? ` · ${esc(d.assignedTo)}` : ""}</li>`),
  ].join("");
  const resultsBlock = `<div style="margin:18px 0 0;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
      <h2 style="margin:0 0 6px;color:#065f46;font-size:16px;">End results — today</h2>
      ${resultRows
        ? `<ul style="margin:0;padding-left:20px;font-size:13px;">${resultRows}</ul>${closedToday.length ? `<div style="margin-top:8px;font-weight:700;color:#065f46;">Revenue closed today: ${usd(closedRevenue)}</div>` : ""}`
        : `<div style="color:#475569;font-size:13px;">No new contracts or closings logged today.</div>`}
    </div>`;

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;">
    <h1 style="color:#0b1f3a;">📋 Daily Results — End of Day</h1>
    <p style="color:#64748b;">${esc(friendlyDate(date))} · did we hit the numbers, why not, and the end results.</p>
    ${summaryStrip}
    ${whyBlock}
    ${resultsBlock}
    <h2 style="margin:22px 0 6px;color:#0b1f3a;font-size:16px;">Scorecard — each member vs goal</h2>
    ${repBlocks}
    ${pipBlock}
    <p style="margin-top:16px;font-size:12px;color:#94a3b8;">🟢 on goal · 🟠 close · 🔴 behind · — not entered. Live: ${APP_URL}/dashboard</p>
  </div>`;

  return sendEmail(`📋 Daily Results (${friendlyDate(date)}): ${summaryLine.replace(/^✅ /, "")}`, html, await reportCfg());
}
