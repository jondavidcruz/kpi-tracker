import "server-only";
// 📅 Send the SELLER a calendar invite when an appointment is booked (Jon 2026-11-11: "we'll send
// them a calendar invite as well"). The rep already gets the event on their own Google Calendar
// (gcal.ts) — this closes the loop with the seller: an .ics attachment + a one-tap "Add to Google
// Calendar" link by email, plus a plain confirmation text. All outbound copy is owner-anonymity
// scrubbed; the text respects quiet hours. Best-effort — never blocks booking.
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";
import { bookingUrl } from "@/lib/book-token";

function icsStamp(d: Date): string { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }

// 📲 Shared seller-SMS send: scrub owner identity, honor quiet hours, use a live line. Returns the
// line used (or null if not sent). Reused by the confirmation, the reminder, and no-show recovery.
async function sellerText(contact: { phone?: string | null; address?: string | null }, rawText: string): Promise<{ sent: boolean; from?: string }> {
  const { scrubOwnerIdentity } = await import("@/lib/scrub-identity");
  const text = scrubOwnerIdentity((rawText || "").trim());
  const d10 = (contact.phone || "").replace(/\D/g, "").slice(-10);
  const to = d10.length === 10 ? `+1${d10}` : "";
  if (!to || !text || !process.env.TELNYX_API_KEY) return { sent: false };
  const { quietHoursWarning } = await import("@/lib/npa-tz");
  if (quietHoursWarning(to, contact.address || "")) return { sent: false };
  const from = process.env.TELNYX_SMS_FROM || process.env.TELNYX_CALLER_ID || "";
  if (!from) return { sent: false };
  try { const res = await fetch("https://api.telnyx.com/v2/messages", { method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, text }) }); return { sent: res.ok, from }; }
  catch { return { sent: false, from }; }
}

function buildIcs(o: { title: string; at: Date; durationMin: number; description: string; uid: string }): string {
  const end = new Date(o.at.getTime() + o.durationMin * 60_000);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//War Room//Appointment//EN", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${o.uid}`, `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(o.at)}`, `DTEND:${icsStamp(end)}`,
    `SUMMARY:${esc(o.title)}`, `DESCRIPTION:${esc(o.description)}`,
    "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Reminder", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

function googleCalLink(o: { title: string; at: Date; durationMin: number; details: string }): string {
  const end = new Date(o.at.getTime() + o.durationMin * 60_000);
  const dates = `${icsStamp(o.at)}/${icsStamp(end)}`;
  const q = new URLSearchParams({ action: "TEMPLATE", text: o.title, dates, details: o.details });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Email + text the seller their appointment confirmation with a calendar invite. */
export async function sendSellerApptInvite(appt: { id: string; oppId: string; contactId: string; title: string; at: Date; note: string; withWho: string }): Promise<void> {
  try {
    const contact = appt.contactId ? await db.crmContact.findUnique({ where: { id: appt.contactId }, select: { name: true, phone: true, email: true, address: true, tags: true } }) : null;
    if (!contact) return;
    const { scrubOwnerIdentity } = await import("@/lib/scrub-identity");
    const first = (contact.name || "there").split(" ")[0];
    const rep = (appt.withWho || "our team").split(" ")[0];
    const whenPT = appt.at.toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const inPerson = /in person|in-person/i.test(appt.note);
    const where = inPerson && contact.address ? ` at ${contact.address}` : "";
    const summary = scrubOwnerIdentity(`Call with ${rep} about ${contact.address || "your property"}`);
    const details = scrubOwnerIdentity(`${rep} will ${inPerson ? "meet you" : "call you"} about ${contact.address || "your property"}. Reply to your original message anytime with questions.`);

    // ✉️ Email with .ics + Google link (if we have an email).
    if (contact.email) {
      const ics = buildIcs({ title: summary, at: appt.at, durationMin: 30, description: details, uid: `appt-${appt.id}@freedom` });
      const gLink = googleCalLink({ title: summary, at: appt.at, durationMin: 30, details });
      const subject = scrubOwnerIdentity(`Confirmed: ${inPerson ? "meeting" : "call"} with ${rep} — ${whenPT} PT`);
      const html = scrubOwnerIdentity(
        `<p>Hi ${first},</p>` +
        `<p>You're confirmed for a ${inPerson ? "meeting" : "call"} with ${rep} about <b>${contact.address || "your property"}</b>${where}.</p>` +
        `<p><b>When:</b> ${whenPT} (Pacific)</p>` +
        `<p><a href="${gLink}">➕ Add to Google Calendar</a> &nbsp;·&nbsp; or open the attached invite.</p>` +
        `<p>Talk soon — and reply here anytime if you have questions.</p><p>— ${rep}</p>`,
      );
      const { sendEmailTo } = await import("@/lib/notify");
      const ok = await sendEmailTo([contact.email], subject, html, undefined, process.env.CASCADE_REPLY_TO || "info@freedom-offers.com", undefined,
        [{ filename: "appointment.ics", content: Buffer.from(ics, "utf8").toString("base64") }]);
      await logCrmEvent({ contactId: appt.contactId, oppId: appt.oppId, kind: "email", body: `➡️ Us: 📅 appointment invite — ${whenPT} PT${ok ? "" : " (SEND FAILED)"}`, meta: { dir: "outbound", auto: true }, actor: "appt-invite" }).catch(() => {});
    }

    // 📲 Confirmation text (if we have a phone + we're not in quiet hours).
    const d10 = (contact.phone || "").replace(/\D/g, "").slice(-10);
    const to = d10.length === 10 ? `+1${d10}` : "";
    if (to && process.env.TELNYX_API_KEY) {
      const { quietHoursWarning } = await import("@/lib/npa-tz");
      if (!quietHoursWarning(to, contact.address || "")) {
        const from = process.env.TELNYX_SMS_FROM || process.env.TELNYX_CALLER_ID || "";
        const text = scrubOwnerIdentity(`Hi ${first}, you're confirmed with ${rep} on ${whenPT} (PT) about ${contact.address || "your property"}. ${inPerson ? "See you then!" : "I'll call you then."} Reply here if you need to change it.`);
        if (from) {
          let ok = false;
          try { const res = await fetch("https://api.telnyx.com/v2/messages", { method: "POST", headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to, text }) }); ok = res.ok; } catch { /* noop */ }
          await logCrmEvent({ contactId: appt.contactId, oppId: appt.oppId, kind: "sms", body: `➡️ Us: ${text}${ok ? "" : " (SEND FAILED)"}`, meta: { dir: "outbound", line: from, auto: true }, actor: "appt-invite" }).catch(() => {});
        }
      }
    }
  } catch { /* best-effort — never blocks booking */ }
}

/** ⏰ Text the SELLER a same-day reminder shortly before the call (cuts no-shows). Best-effort. */
export async function sendSellerApptReminder(appt: { id: string; oppId: string; contactId: string; at: Date; note: string; withWho: string }): Promise<void> {
  try {
    const contact = appt.contactId ? await db.crmContact.findUnique({ where: { id: appt.contactId }, select: { name: true, phone: true, address: true } }) : null;
    if (!contact?.phone) return;
    const first = (contact.name || "there").split(" ")[0];
    const rep = (appt.withWho || "our team").split(" ")[0];
    const timePT = appt.at.toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
    const inPerson = /in person|in-person/i.test(appt.note);
    const text = `Hi ${first}, quick reminder — ${rep} ${inPerson ? "is meeting you" : "will call you"} today at ${timePT} (PT) about ${contact.address || "your property"}. ${inPerson ? "See you soon!" : "Talk soon!"} Reply here if you need to change it.`;
    const r = await sellerText(contact, text);
    if (r.sent) await logCrmEvent({ contactId: appt.contactId, oppId: appt.oppId, kind: "sms", body: `➡️ Us: ⏰ appointment reminder — ${timePT} PT`, meta: { dir: "outbound", line: r.from, auto: true }, actor: "appt-reminder" }).catch(() => {});
  } catch { /* best-effort */ }
}

/** 🔁 No-show recovery: after a missed call with no contact, text the seller a rebook link so the
 *  lead doesn't die on a missed appointment. Returns true if a message went out. Best-effort. */
export async function sendNoShowRecovery(appt: { id: string; oppId: string; contactId: string; at: Date; note: string; withWho: string }): Promise<boolean> {
  try {
    const contact = appt.contactId ? await db.crmContact.findUnique({ where: { id: appt.contactId }, select: { name: true, phone: true, address: true } }) : null;
    if (!contact?.phone) return false;
    const first = (contact.name || "there").split(" ")[0];
    const rep = (appt.withWho || "our team").split(" ")[0];
    const link = appt.oppId ? bookingUrl(appt.oppId) : "";
    const text = `Hi ${first}, it's ${rep} — sorry we missed each other about ${contact.address || "your property"}! No worries at all. Grab a new time that works for you${link ? `: ${link}` : " — just reply with a day/time"}.`;
    const r = await sellerText(contact, text);
    if (r.sent) await logCrmEvent({ contactId: appt.contactId, oppId: appt.oppId, kind: "sms", body: `➡️ Us: 🔁 no-show recovery — sent a rebook link`, meta: { dir: "outbound", line: r.from, auto: true }, actor: "appt-noshow" }).catch(() => {});
    return r.sent;
  } catch { return false; }
}
