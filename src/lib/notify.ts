// Notification channels: Google Chat (incoming webhook) + email (Resend REST).
// Both degrade gracefully to a no-op + console log when unconfigured, so the
// app is fully usable locally without any secrets.
import { getSettings } from "./data";

export interface ChannelConfig {
  chatWebhook: string;
  timecardChatWebhook: string; // separate space for clock-in/break/lunch status posts
  callAuditChatWebhook: string; // separate space for scored-call audit posts
  huddleChatWebhook: string; // separate space for the daily huddle brief + nudges
  teamChatWebhook: string; // general team space: wins, culture, recordings, digests (NOT KPI alerts)
  emailRecipients: string[];
  emailFrom: string;
  resendKey: string;
}

export async function getChannelConfig(): Promise<ChannelConfig> {
  const s = await getSettings();
  return {
    chatWebhook: s.googleChatWebhook || process.env.GOOGLE_CHAT_WEBHOOK_URL || "",
    timecardChatWebhook: s.timecardChatWebhook || process.env.TIMECARD_CHAT_WEBHOOK || "",
    callAuditChatWebhook: s.callAuditChatWebhook || process.env.CALL_AUDIT_CHAT_WEBHOOK || "",
    huddleChatWebhook: process.env.HUDDLE_CHAT_WEBHOOK || "",
    teamChatWebhook: process.env.TEAM_CHAT_WEBHOOK || "",
    emailRecipients: splitList(s.alertEmailRecipients || process.env.ALERT_EMAIL_TO || ""),
    emailFrom: s.emailFromAddress || process.env.ALERT_EMAIL_FROM || "",
    resendKey: process.env.RESEND_API_KEY || "",
  };
}

function splitList(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Low-level: POST text to a specific Google Chat incoming-webhook URL. */
async function postChatWebhook(url: string, text: string): Promise<boolean> {
  if (!url) {
    console.log("[notify] Google Chat not configured — would send:\n" + text);
    return false;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error("[notify] Google Chat failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] Google Chat error:", err);
    return false;
  }
}

/** Post a message to the main Google Chat space (alerts, digests). */
export async function sendGoogleChat(text: string, cfg?: ChannelConfig): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  return postChatWebhook(c.chatWebhook, text);
}

/** Post a scored-call audit to the dedicated Call Audit space if its webhook is
 *  set, else the general team space — never the KPI-alerts space. */
export async function sendCallAuditChat(text: string, cfg?: ChannelConfig): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  return postChatWebhook(c.callAuditChatWebhook || c.teamChatWebhook, text);
}

/** Post a general team message (wins, culture, digests, recordings check) to the
 *  team space — never the KPI-alerts space, so that channel stays alerts-only.
 *  Set TEAM_CHAT_WEBHOOK to route these; unset = they don't post to chat. */
export async function sendTeamChat(text: string, cfg?: ChannelConfig): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  return postChatWebhook(c.teamChatWebhook, text);
}

/** Post a time-card status update (clock-in / break / lunch) to the Timecard
 *  space if its webhook is set, otherwise fall back to the main space. */
export async function sendTimecardChat(text: string, cfg?: ChannelConfig): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  // Only the dedicated Timecard space — never fall back to the main KPI Tracker
  // space, so clock/break/lunch status posts can't land there.
  return postChatWebhook(c.timecardChatWebhook, text);
}

/** Post the daily huddle (brief + goal nudges) to the dedicated Huddle space only.
 *  Never falls back to the main KPI-alerts space, so the huddle can't clutter it.
 *  Set HUDDLE_CHAT_WEBHOOK to a Google Chat space to route it there; leave it unset
 *  to keep the huddle out of chat entirely (it still goes out by email). */
export async function sendHuddleChat(text: string, cfg?: ChannelConfig): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  return postChatWebhook(c.huddleChatWebhook, text);
}

/** Send an email via Resend. Returns true if delivered. */
export async function sendEmail(
  subject: string,
  html: string,
  cfg?: ChannelConfig,
): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  if (!c.resendKey || c.emailRecipients.length === 0 || !c.emailFrom) {
    console.log(`[notify] Email not configured — would send: "${subject}"`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: c.emailFrom,
        to: c.emailRecipients,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("[notify] Email failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notify] Email error:", err);
    return false;
  }
}

/** Send to explicit recipients (e.g. a single rep), not the configured alert list. */
export async function sendEmailTo(
  to: string[],
  subject: string,
  html: string,
  cfg?: ChannelConfig,
): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  if (!c.resendKey || to.length === 0 || !c.emailFrom) {
    console.log(`[notify] Email-to not configured — would send "${subject}" to ${to.join(", ")}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.emailFrom, to, subject, html }),
    });
    if (!res.ok) { console.error("[notify] Email-to failed:", res.status, await res.text()); return false; }
    return true;
  } catch (err) { console.error("[notify] Email-to error:", err); return false; }
}

/** Send an email with one file attachment (content = base64 string). */
export async function sendEmailWithAttachment(
  to: string[],
  subject: string,
  html: string,
  attachment: { filename: string; content: string },
  cfg?: ChannelConfig,
): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  if (!c.resendKey || to.length === 0 || !c.emailFrom) {
    console.log(`[notify] Attachment email not configured — would send "${subject}"`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${c.resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.emailFrom, to, subject, html, attachments: [attachment] }),
    });
    if (!res.ok) { console.error("[notify] Attachment email failed:", res.status, await res.text()); return false; }
    return true;
  } catch (err) { console.error("[notify] Attachment email error:", err); return false; }
}

/** Wrap alert lines in a minimal, readable HTML email. */
export function alertEmailHtml(title: string, lines: string[]): string {
  const items = lines
    .map(
      (l) =>
        `<li style="margin:6px 0;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;">${escapeHtml(
          l,
        )}</li>`,
    )
    .join("");
  return `<div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:0 auto;">
    <h2 style="color:#0f172a;">${escapeHtml(title)}</h2>
    <ul style="list-style:none;padding:0;">${items}</ul>
    <p style="color:#64748b;font-size:13px;">Open the dashboard to acknowledge or resolve these.</p>
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
