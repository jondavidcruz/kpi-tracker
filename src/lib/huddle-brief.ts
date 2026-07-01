import { getSettings } from "./data";
import { buildHuddleData } from "./huddle";
import { sendHuddleChat, sendEmailTo } from "./notify";
import { friendlyDate } from "./date";

/** Compile the day's huddle into a brief and push it to Google Chat + email so the
 *  9am meeting (and accountability) runs even when Jon isn't there. */
export async function sendHuddleBrief(date: string): Promise<{ chat: boolean; email: boolean }> {
  const settings = await getSettings();
  const h = await buildHuddleData(date, { carry: true }); // morning brief = carry yesterday's undone items

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
    sendHuddleChat(chatText),
    to.length ? sendEmailTo(to, `🗣️ Daily Huddle — ${friendlyDate(date)}`, html) : Promise.resolve(false),
  ]);
  return { chat, email };
}

/** Nudge anyone who hasn't kept the huddle current. `am` = hasn't set today's
 *  goals yet (fires ~9:30 after the 9am huddle); `pm` = end-of-day reminder to
 *  check off what's done / roll the rest (anyone not updated or with open items). */
export async function sendHuddleNudge(date: string, slot: "am" | "pm"): Promise<{ chat: boolean; nudged: string[] }> {
  const h = await buildHuddleData(date, { carry: slot === "am" });
  const targets = slot === "am"
    ? h.reps.filter((r) => !r.updatedToday)
    : h.reps.filter((r) => !r.updatedToday || r.openCount > 0);
  if (targets.length === 0) {
    // Everyone's current — celebrate it so the channel sees the streak.
    if (slot === "am") await sendHuddleChat(`✅ *Huddle's in* — everyone set today's goals. Let's go. 🚀`);
    return { chat: false, nudged: [] };
  }
  const names = targets.map((r) => r.name.split(/\s+/)[0]).join(", ");
  const msg = slot === "am"
    ? `⏰ *Huddle reminder* — haven't set today's goals yet: *${names}*. 30 seconds in the War Room → Daily Huddle. 🎯`
    : `🌙 *End-of-day check* — before you log off, mark what you finished and roll the rest: *${names}*. War Room → Daily Huddle.`;
  const chat = await sendHuddleChat(msg);
  return { chat, nudged: targets.map((r) => r.name) };
}
