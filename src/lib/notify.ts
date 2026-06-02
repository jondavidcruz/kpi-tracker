// Notification channels: Google Chat (incoming webhook) + email (Resend REST).
// Both degrade gracefully to a no-op + console log when unconfigured, so the
// app is fully usable locally without any secrets.
import { getSettings } from "./data";

export interface ChannelConfig {
  chatWebhook: string;
  emailRecipients: string[];
  emailFrom: string;
  resendKey: string;
}

export async function getChannelConfig(): Promise<ChannelConfig> {
  const s = await getSettings();
  return {
    chatWebhook: s.googleChatWebhook || process.env.GOOGLE_CHAT_WEBHOOK_URL || "",
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

/** Post a message to Google Chat. Returns true if delivered. */
export async function sendGoogleChat(
  text: string,
  cfg?: ChannelConfig,
): Promise<boolean> {
  const c = cfg ?? (await getChannelConfig());
  if (!c.chatWebhook) {
    console.log("[notify] Google Chat not configured — would send:\n" + text);
    return false;
  }
  try {
    const res = await fetch(c.chatWebhook, {
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
