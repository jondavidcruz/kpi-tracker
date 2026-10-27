// 📞 One place for US phone formatting + validation (Jon 2026-10-27: a shifted/partial number
// was texting the wrong place; warn on anything that isn't a valid number). Client-safe, pure.

/** Last 10 digits of whatever the user typed. */
export function phone10(n: string | null | undefined): string {
  return String(n ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "").slice(-10);
}

/** A real US number: 10 digits, and both the area code and exchange start 2–9 (NANP rules). */
export function isValidUsPhone(n: string | null | undefined): boolean {
  const d = phone10(n);
  return d.length === 10 && /[2-9]/.test(d[0]) && /[2-9]/.test(d[3]);
}

/** "(917) 848-2271" when valid, else the raw input so nothing is hidden. */
export function fmtPhone(n: string | null | undefined): string {
  const d = phone10(n);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(n ?? "");
}

/** "+1XXXXXXXXXX" for dialing/texting, or "" when the number isn't valid. */
export function toE164(n: string | null | undefined): string {
  return isValidUsPhone(n) ? `+1${phone10(n)}` : "";
}

/** A short reason the number looks off (for a warning), or "" when it's fine / empty. */
export function phoneWarn(n: string | null | undefined): string {
  const raw = String(n ?? "").trim();
  if (!raw) return "";
  if (isValidUsPhone(raw)) return "";
  const d = raw.replace(/\D/g, "");
  if (d.length < 10) return `only ${d.length} digits — a US number has 10`;
  if (d.replace(/^1/, "").length > 10) return `${d.length} digits — too many (extra digit?)`;
  return "doesn't look like a valid US number";
}
