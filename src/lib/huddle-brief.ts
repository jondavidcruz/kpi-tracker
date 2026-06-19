import { getSettings } from "./data";
import { buildHuddleData } from "./huddle";
import { sendGoogleChat, sendEmailTo } from "./notify";
import { friendlyDate } from "./date";

/** Compile the day's huddle into a brief and push it to Google Chat + email so the
 *  9am meeting (and accountability) runs even when Jon isn't there. */
export async function sendHuddleBrief(date: string): Promise<{ chat: boolean; email: boolean }> {
  const settings = await getSettings();
  const h = await buildHuddleData(date);

  // ---- Plain text (Google Chat) ----
  const lines: string[] = [`*🗣️ Daily Huddle — ${friendlyDate(date)}*`];
  lines.push(h.misses.length === 0 ? `\n✅ Yesterday: everyone hit target.` : `\n*📉 Yesterday's misses:*`);
  for (const m of h.misses) lines.push(`• ${m.name} — ${m.kpi} (${Math.round(m.actual)}/${Math.round(m.expected)})${m.repReason ? ` — “${m.repReason}”` : ""}`);
  if (h.pips.length) { lines.push(`\n*🟠 On PIP → works Saturday:*`); for (const p of h.pips) lines.push(`• ${p.name} — ${p.kpiName}`); }
  const repLine = (r: (typeof h.reps)[number]) => {
    const out = [`\n*${r.name}* (${r.role})${r.submitted ? "" : " — ⚠️ not submitted"}`];
    if (r.goal) out.push(`🎯 ${r.goal}`);
    if (r.pending) out.push(`⏮ pending: ${r.pending}`);
    for (const it of r.items) out.push(`🔥 ${it.title}${it.status ? ` — ${it.status}` : ""}${it.roadblock ? ` · roadblock: ${it.roadblock}` : ""}${it.todayAction ? ` · today: ${it.todayAction}` : ""}`);
    for (const d of r.deals) out.push(`📦 ${d.deal.address}${d.days != null ? ` (${d.days}d)` : ""} — ${d.deal.nextSteps || d.recommendation}`);
    if (r.note) out.push(`📝 ${r.note}`);
    return out.join("\n");
  };
  const acq = h.reps.filter((r) => r.role === "Acquisitions");
  const dispo = h.reps.filter((r) => r.role === "Dispositions");
  if (acq.length) { lines.push(`\n*🎯 ACQUISITIONS*`); acq.forEach((r) => lines.push(repLine(r))); }
  if (dispo.length) { lines.push(`\n*📦 DISPOSITIONS*`); dispo.forEach((r) => lines.push(repLine(r))); }
  const chatText = lines.join("\n");

  // ---- HTML (email) ----
  const esc = (s: string) => (s || "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const repHtml = (r: (typeof h.reps)[number]) => `<div style="margin:8px 0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px">
    <strong>${esc(r.name)}</strong> <span style="color:#94a3b8">${r.role}${r.submitted ? "" : " · ⚠️ not submitted"}</span>
    ${r.goal ? `<div>🎯 ${esc(r.goal)}</div>` : ""}${r.pending ? `<div style="color:#64748b">⏮ ${esc(r.pending)}</div>` : ""}
    ${r.items.map((it) => `<div>🔥 <strong>${esc(it.title)}</strong> ${esc([it.status && `— ${it.status}`, it.roadblock && `· roadblock: ${it.roadblock}`, it.todayAction && `· today: ${it.todayAction}`].filter(Boolean).join(" "))}</div>`).join("")}
    ${r.deals.map((d) => `<div>📦 <strong>${esc(d.deal.address)}</strong> ${d.days != null ? `(${d.days}d)` : ""} — ${esc(d.deal.nextSteps || d.recommendation)}</div>`).join("")}
    ${r.note ? `<div style="color:#64748b">📝 ${esc(r.note)}</div>` : ""}
  </div>`;
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:680px;margin:0 auto;color:#0f172a">
    <h2 style="color:#0b1f3a">🗣️ Daily Huddle — ${friendlyDate(date)}</h2>
    <h3 style="margin:14px 0 4px">📉 Yesterday's misses</h3>
    ${h.misses.length === 0 ? `<p style="color:#16a34a">Everyone hit target. 🎉</p>` : `<ul>${h.misses.map((m) => `<li><strong>${esc(m.name)}</strong> — ${esc(m.kpi)} (${Math.round(m.actual)}/${Math.round(m.expected)})${m.repReason ? ` — “${esc(m.repReason)}”` : ""}</li>`).join("")}</ul>`}
    ${h.pips.length ? `<h3 style="margin:14px 0 4px">🟠 On PIP → works Saturday</h3><ul>${h.pips.map((p) => `<li><strong>${esc(p.name)}</strong> — ${esc(p.kpiName)}</li>`).join("")}</ul>` : ""}
    ${acq.length ? `<h3 style="margin:14px 0 4px">🎯 Acquisitions</h3>${acq.map(repHtml).join("")}` : ""}
    ${dispo.length ? `<h3 style="margin:14px 0 4px">📦 Dispositions</h3>${dispo.map(repHtml).join("")}` : ""}
    <p style="color:#94a3b8;font-size:12px;margin-top:14px">Open the Daily Huddle in the War Room to run it live.</p>
  </div>`;

  const to = (settings.weeklyEmailRecipients || settings.alertEmailRecipients || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  const [chat, email] = await Promise.all([
    sendGoogleChat(chatText),
    to.length ? sendEmailTo(to, `🗣️ Daily Huddle — ${friendlyDate(date)}`, html) : Promise.resolve(false),
  ]);
  return { chat, email };
}
