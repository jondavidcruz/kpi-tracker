import { db } from "./db";
import { getSettings } from "./data";

export type CheckStatus = "ok" | "warn" | "down";
export type Check = { name: string; status: CheckStatus; detail: string; critical?: boolean };
export type Health = { overall: "green" | "yellow" | "red"; checks: Check[]; checkedAt: number };

const has = (k: string) => !!(process.env[k] && process.env[k]!.trim());
const opt = (ok: boolean, name: string, okDetail: string, warnDetail: string): Check =>
  ok ? { name, status: "ok", detail: okDetail } : { name, status: "warn", detail: warnDetail };

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

  checks.push(opt(has("ANTHROPIC_API_KEY"), "Call scoring (Claude)", "AI key set — scoring works.", "No ANTHROPIC_API_KEY — call scoring is disabled."));
  checks.push(opt(has("GEMINI_API_KEY"), "Transcription (Gemini)", "Shared key set.", "No shared Gemini key — reps must use their own (BYOK)."));
  checks.push(opt(has("REIREPLY_API_KEY") && has("REIREPLY_LOCATION_ID"), "CRM sync (REI Reply)", "Connected — KPIs auto-sync.", "REI Reply key/location missing — KPIs won't auto-sync."));
  checks.push(opt(has("RESEND_API_KEY") && has("ALERT_EMAIL_FROM"), "Email alerts (Resend)", "Configured.", "Resend not set — email alerts won't send."));
  checks.push(opt(chatOk, "Team Google Chat", "Webhook set — alerts post.", "No Google Chat webhook — chat alerts won't post."));
  checks.push(opt((has("GOOGLE_SERVICE_ACCOUNT_JSON") || (has("GOOGLE_SA_EMAIL") && has("GOOGLE_SA_PRIVATE_KEY"))) && has("GDRIVE_FOLDER_ID"), "Recordings → Google Drive", "Drive service account set.", "Drive not configured — call recordings won't archive."));
  checks.push(opt(has("SUPABASE_SERVICE_ROLE_KEY"), "Recording uploads (storage)", "Storage configured.", "No storage key — large recording uploads are disabled."));

  const overall = checks.some((c) => c.status === "down") ? "red" : checks.some((c) => c.status === "warn") ? "yellow" : "green";
  return { overall, checks, checkedAt: Date.now() };
}
