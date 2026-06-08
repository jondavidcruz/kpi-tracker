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
import { lastWeekRange, datesInRange } from "./date";
import { formatValue, type Unit } from "./format";
import { POSITIONS } from "./roles";
import { sendEmail, getChannelConfig } from "./notify";

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

  // ---- Irish focus block ----
  const irish = reps.find((r) => r.name.toLowerCase().startsWith("irish"));
  let irishBlock = "";
  if (irish) {
    const irishKpis = perRep.filter((k) => k.roleKey === irish.position);
    const active = daysActiveByUser.get(irish.id)?.size ?? 0;
    const reliability = workdays ? Math.round((active / workdays) * 100) : 0;
    const lines = irishKpis
      .map((k) => {
        const total = sums.get(`${k.id}|${irish.id}`) ?? 0;
        const days = [...(daysActiveByUser.get(irish.id) ?? [])].length;
        const goal = resolveGoalWith(targets, k, irish.id, month);
        const avg = days ? total / days : 0;
        const goalStr = goal === null ? "" : ` · goal ${formatValue(k.unit as Unit, goal)}`;
        return `<li style="margin:3px 0;">${esc(k.emoji)} <strong>${esc(k.name)}:</strong> ${formatValue(k.unit as Unit, total)} total · ${formatValue(k.unit as Unit, avg)}/logged-day${goalStr}</li>`;
      })
      .join("");
    const relColor = reliability < 60 ? "#b91c1c" : reliability < 85 ? "#b45309" : "#047857";
    irishBlock = `<div style="margin-top:22px;padding:14px 16px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;">
      <h2 style="margin:0 0 6px;color:#6b21a8;">📋 Irish — Performance Focus</h2>
      <p style="margin:0 0 8px;color:#475569;">Reliability: <strong style="color:${relColor};">${reliability}%</strong> (${active}/${workdays} workdays). Role: lead manager — appointments set is the deliverable; process calls = training.</p>
      <ul style="margin:0;padding-left:20px;color:#334155;font-size:13px;">${lines}</ul>
      <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">Decision lens: is a 2nd lead manager justified by current lead volume? See the full review in the app → Admin → Weekly performance reviews.</p>
    </div>`;
  }

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a;">
    <h1 style="color:#0b1f3a;">📊 Freedom Offers — Weekly Team KPIs</h1>
    <p style="color:#64748b;">Week of ${esc(wk.label)} · totals per rep (and days worked Mon–Fri).</p>
    ${roleSections}
    ${irishBlock}
    <p style="margin-top:20px;font-size:12px;color:#94a3b8;">Live dashboard: https://kpi-tracker-lovat.vercel.app/report</p>
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

  return sendEmail(`📊 Weekly Team KPIs — week of ${wk.label}`, html, weeklyCfg);
}
