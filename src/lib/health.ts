import { db } from "./db";
import { getSettings } from "./data";

export type CheckStatus = "ok" | "warn" | "down";
export type Check = { name: string; status: CheckStatus; detail: string; critical?: boolean; fix?: string };
export type Health = { overall: "green" | "yellow" | "red"; checks: Check[]; checkedAt: number };

const has = (k: string) => !!(process.env[k] && process.env[k]!.trim());
const opt = (ok: boolean, name: string, okDetail: string, warnDetail: string, fix?: string): Check =>
  ok ? { name, status: "ok", detail: okDetail } : { name, status: "warn", detail: warnDetail, fix };

/** Runs a live check of every system the War Room depends on. */
export async function computeHealth(): Promise<Health> {
  const checks: Check[] = [];

  // Database — if this is down, nothing works.
  try { await db.user.count(); checks.push({ name: "Database", status: "ok", detail: "Connected & responding.", critical: true }); }
  catch { checks.push({ name: "Database", status: "down", detail: "Can't reach the database — the app can't load data.", critical: true }); }

  // Login / auth — keys must be baked into the build.
  checks.push(has("NEXT_PUBLIC_SUPABASE_URL") && has("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    ? { name: "Login & sign-in", status: "ok", detail: "Supabase auth configured.", critical: true }
    : { name: "Login & sign-in", status: "down", detail: "Supabase keys missing — the team can't log in.", critical: true });

  let chatOk = has("GOOGLE_CHAT_WEBHOOK_URL");
  try { const s = await getSettings(); chatOk = chatOk || !!s.googleChatWebhook; } catch { /* settings unreadable */ }

  checks.push(opt(has("ANTHROPIC_API_KEY"), "Call scoring (Claude)", "AI key set — scoring works.", "No ANTHROPIC_API_KEY — call scoring is disabled.", "Add ANTHROPIC_API_KEY (from console.anthropic.com) in Vercel → Settings → Environment Variables, then redeploy."));
  checks.push(opt(has("GEMINI_API_KEY"), "Transcription (Gemini)", "Shared key set.", "No shared Gemini key — reps must use their own (BYOK).", "Optional: add GEMINI_API_KEY in Vercel to give everyone a shared transcription key."));
  checks.push(opt(has("REIREPLY_API_KEY") && has("REIREPLY_LOCATION_ID"), "CRM sync (REI Reply)", "Connected — KPIs auto-sync.", "REI Reply key/location missing — KPIs won't auto-sync.", "Add REIREPLY_API_KEY + REIREPLY_LOCATION_ID in Vercel, then redeploy."));
  checks.push(opt(has("RESEND_API_KEY") && has("ALERT_EMAIL_FROM"), "Email alerts (Resend)", "Configured.", "Resend not set — email alerts won't send.", "1) Make a free key at resend.com and verify the freedom-offers.com sending domain. 2) In Vercel → Settings → Environment Variables add RESEND_API_KEY and ALERT_EMAIL_FROM (e.g. \"War Room <alerts@freedom-offers.com>\"). 3) Redeploy."));
  checks.push(opt(chatOk, "Team Google Chat", "Webhook set — alerts post.", "No Google Chat webhook — chat alerts won't post.", "Add GOOGLE_CHAT_WEBHOOK_URL in Vercel (or set the webhook on the Admin page), then redeploy."));
  checks.push(opt((has("GOOGLE_SERVICE_ACCOUNT_JSON") || (has("GOOGLE_SA_EMAIL") && has("GOOGLE_SA_PRIVATE_KEY"))) && has("GDRIVE_FOLDER_ID"), "Recordings → Google Drive", "Drive service account set.", "Drive not configured — call recordings won't archive.", "Add GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_SA_EMAIL + GOOGLE_SA_PRIVATE_KEY) and GDRIVE_FOLDER_ID in Vercel, then redeploy."));
  checks.push(opt(has("SUPABASE_SERVICE_ROLE_KEY"), "Recording uploads (storage)", "Storage configured.", "No storage key — large recording uploads are disabled.", "Add SUPABASE_SERVICE_ROLE_KEY (Supabase → Project Settings → API) in Vercel, then redeploy."));

  const overall = checks.some((c) => c.status === "down") ? "red" : checks.some((c) => c.status === "warn") ? "yellow" : "green";
  return { overall, checks, checkedAt: Date.now() };
}
