// 🕶 Keep the OWNER anonymous in outbound marketing (Jon 2026-10-29: "make sure my full name and
// company name are never included in the emails or SMS sent"). Any message text we hand to a send
// path (DirectREI blast, drips, cascade) runs through this first. Replaces the owner's name + the
// company name with a neutral "our team" so the copy still reads, then tidies duplicates.
// Add exact name variants via env OUTREACH_SCRUB_NAMES (comma-separated) — matched case-insensitively.
const DEFAULT_TARGETS = ["Freedom Offers", "Jonathan David Cruz", "Jon David Cruz", "Jonathan Cruz", "Jon Cruz"];

function targets(): string[] {
  const extra = (process.env.OUTREACH_SCRUB_NAMES || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...extra, ...DEFAULT_TARGETS])].sort((a, b) => b.length - a.length); // longest first
}

export function scrubOwnerIdentity(text?: string | null): string {
  if (!text) return text ?? "";
  let out = String(text);
  for (const t of targets()) {
    const rx = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
    out = out.replace(rx, "our team");
  }
  // collapse "our team, our team" / "our team and our team" / repeats into one
  out = out.replace(/\bour team\b(\s*[,/&|-]+\s*|\s+and\s+|\s+)(?=our team\b)/gi, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
}

export function scrubMessage(m: { sms?: string; email_subject?: string; email_body?: string }): { sms?: string; email_subject?: string; email_body?: string } {
  return {
    ...(m.sms !== undefined ? { sms: scrubOwnerIdentity(m.sms) } : {}),
    ...(m.email_subject !== undefined ? { email_subject: scrubOwnerIdentity(m.email_subject) } : {}),
    ...(m.email_body !== undefined ? { email_body: scrubOwnerIdentity(m.email_body) } : {}),
  };
}
