import crypto from "crypto";
import { APP_URL } from "@/lib/site";
// 🔗 Signed, no-login booking links (Jon 2026-11-11: sellers can self-book a call). Same HMAC
// pattern as the cascade claim/pass links — the token is `<oppId>.<sig>`; oppIds are cuids (no dots)
// so the last dot splits cleanly. No DB token table needed.
const SECRET = process.env.CRON_SECRET || process.env.CASCADE_SECRET || "war-room-book";

function sig(oppId: string): string {
  return crypto.createHmac("sha256", SECRET).update(`book|${oppId}`).digest("hex").slice(0, 24);
}
export function bookToken(oppId: string): string { return `${oppId}.${sig(oppId)}`; }
export function verifyBookToken(token: string): string | null {
  const i = (token || "").lastIndexOf(".");
  if (i < 1) return null;
  const oppId = token.slice(0, i);
  return token.slice(i + 1) === sig(oppId) ? oppId : null;
}
export function bookingUrl(oppId: string): string { return `${APP_URL}/book/${bookToken(oppId)}`; }
