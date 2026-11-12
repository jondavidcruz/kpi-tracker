// 🕶 Keep the OWNER anonymous in outbound marketing (Jon 2026-10-29: "make sure my full name and
// company name are never included in the emails or SMS sent"). Any message text we hand to a send
// path (DirectREI blast, drips, cascade) runs through this first. Replaces the owner's name + the
// company name with a neutral "our team" so the copy still reads, then tidies duplicates.
// Add exact name variants via env OUTREACH_SCRUB_NAMES (comma-separated) — matched case-insensitively.
const DEFAULT_TARGETS = ["Freedom Offers", "Jonathan David Cruz", "Jon David Cruz", "Jonathan Cruz", "Jon Cruz"];
// 🌐 Website / owner email domains stripped from every outbound message (Jon 2026-11-11: "remove
// anything that states my website or my full information"). The URL, bare domain, and any
// name@domain email are removed entirely. First names (Jon, Michelle, …) are intentionally kept.
const DEFAULT_DOMAINS = ["freedom-offers.com", "freedomoffers.com"];

function targets(): string[] {
  const extra = (process.env.OUTREACH_SCRUB_NAMES || "").split(",").map((s) => s.trim()).filter(Boolean);
  return [...new Set([...extra, ...DEFAULT_TARGETS])].sort((a, b) => b.length - a.length); // longest first
}

function domains(): string[] {
  const extra = (process.env.OUTREACH_SCRUB_URLS || "").split(",")
    .map((s) => s.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase())
    .filter(Boolean);
  return [...new Set([...extra, ...DEFAULT_DOMAINS])].sort((a, b) => b.length - a.length); // longest first
}

export function scrubOwnerIdentity(text?: string | null): string {
  if (!text) return text ?? "";
  let out = String(text);
  for (const t of targets()) {
    const rx = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"), "gi");
    out = out.replace(rx, "our team");
  }
  // ☎️ strip owner/company phone numbers (the toll-free Googles straight back to the company — Jon
  // 2026-11-12). Any format of 877-652-8991, plus env OUTREACH_SCRUB_PHONES (comma-separated digits).
  const phoneDigits = [...new Set([
    ...(process.env.OUTREACH_SCRUB_PHONES || "").split(",").map((s) => s.replace(/\D/g, "")).filter((s) => s.length >= 10),
    "8776528991",
  ])];
  for (const d10 of phoneDigits) {
    const core = d10.slice(-10);
    const rx = new RegExp(`\\+?1?[\\s.()-]*${core[0]}${core[1]}${core[2]}[\\s.()-]*${core[3]}${core[4]}${core[5]}[\\s.()-]*${core.slice(6)}`, "g");
    out = out.replace(rx, "");
  }
  // 🌐 strip website URLs, bare domains, and name@domain emails for each owned domain.
  for (const d of domains()) {
    const dq = d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`[\\w.+-]+@${dq}\\b`, "gi"), "");          // emails at the domain
    out = out.replace(new RegExp(`https?:\\/\\/(?:www\\.)?${dq}[^\\s)\\]]*`, "gi"), ""); // full URLs
    out = out.replace(new RegExp(`\\b(?:www\\.)?${dq}\\b`, "gi"), "");      // bare domain
  }
  // collapse "our team, our team" / "our team and our team" / repeats into one
  out = out.replace(/\bour team\b(\s*[,/&|-]+\s*|\s+and\s+|\s+)(?=our team\b)/gi, "");
  // tidy "The our team Team" → "our team" and leftover dangling separators from a removed URL
  out = out.replace(/\bThe\s+our team\s+Team\b/gi, "our team");
  out = out.replace(/\n[ \t]*[—–-]\s*$/g, "").replace(/[ \t]*[—–|/]+[ \t]*(?=\n|$)/g, "");
  return out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?;:])/g, "$1").replace(/\n{3,}/g, "\n\n").trim();
}

export function scrubMessage(m: { sms?: string; email_subject?: string; email_body?: string }): { sms?: string; email_subject?: string; email_body?: string } {
  return {
    ...(m.sms !== undefined ? { sms: scrubOwnerIdentity(m.sms) } : {}),
    ...(m.email_subject !== undefined ? { email_subject: scrubOwnerIdentity(m.email_subject) } : {}),
    ...(m.email_body !== undefined ? { email_body: scrubOwnerIdentity(m.email_body) } : {}),
  };
}
