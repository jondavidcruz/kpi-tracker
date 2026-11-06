// 🕘 Quiet-hours guard (Jon 2026-10-08): never dial a lead between 9pm and
// 8am IN THEIR time zone, judged by area code. Compact NPA → IANA zone map
// (US + CA majors); unknown codes fall back to the org zone, better safe.
const E = "America/New_York", C = "America/Chicago", M = "America/Denver", MA = "America/Phoenix", P = "America/Los_Angeles", AK = "America/Anchorage", H = "Pacific/Honolulu";

const NPA: Record<string, string> = {};
const add = (tz: string, codes: string) => { for (const c of codes.split(" ")) NPA[c] = tz; };

add(E, "201 202 203 207 212 215 216 220 223 229 234 239 240 248 267 269 276 301 302 304 305 313 315 321 330 332 336 339 347 351 352 380 386 401 404 407 410 412 413 419 434 440 443 445 470 475 478 484 508 513 516 517 518 561 567 570 571 585 603 607 609 610 614 616 617 631 646 678 689 703 704 706 716 717 718 724 727 732 740 743 754 757 762 770 772 774 781 786 802 803 804 813 814 828 835 843 845 848 850 854 856 857 859 860 862 863 864 878 904 906 908 910 912 914 917 919 937 941 947 954 959 973 978 980 984");
add(C, "205 210 214 217 218 224 225 228 251 254 256 262 281 309 312 314 316 318 319 320 331 334 337 361 402 405 409 414 417 430 432 469 479 501 504 507 512 515 531 535 563 573 601 605 608 612 615 618 620 630 636 641 651 660 662 682 701 708 712 713 715 731 737 763 769 773 779 785 806 815 816 817 830 832 847 870 901 903 913 918 920 931 936 938 940 945 952 956 972 979 985");
add(M, "303 307 385 406 435 505 575 719 720 801 915 970 983");
add(MA, "480 520 602 623 928");
add(P, "206 209 213 253 279 310 323 341 360 408 415 424 425 442 458 503 509 530 541 559 562 619 626 628 650 657 661 669 702 707 714 725 747 760 775 805 818 820 831 858 909 916 925 949 951 971");
add(AK, "907");
add(H, "808");

export function tzForPhone(phone: string): string | null {
  const npa = phone.replace(/\D/g, "").replace(/^1/, "").slice(0, 3);
  return NPA[npa] ?? null;
}

// 🏠 Timezone from the lead's ADDRESS (Jon 2026-11-05: judge quiet hours by area code AND
// address — a ported number can lie about where the person actually is). Maps the US state
// in the address to its primary IANA zone. Split-zone states use their primary zone; the
// area-code signal covers the exceptions, and quietHoursWarning blocks if EITHER says quiet.
const STATE_TZ: Record<string, string> = {};
const addS = (tz: string, codes: string) => { for (const c of codes.split(" ")) STATE_TZ[c] = tz; };
addS(E, "CT DE FL GA IN KY MA MD ME MI NC NH NJ NY OH PA RI SC VA VT WV DC");
addS(C, "AL AR IL IA KS LA MN MS MO ND NE OK SD TN TX WI");
addS(M, "CO ID MT NM UT WY");
addS(MA, "AZ");
addS(P, "CA NV OR WA");
addS(AK, "AK");
addS(H, "HI");
// Full state names → abbreviation, for addresses that spell the state out.
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO", connecticut: "CT",
  delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY",
};
export function tzForAddress(address?: string | null): string | null {
  const a = (address || "").trim();
  if (!a) return null;
  // 1) "…, FL 33139" — the 2-letter state right before a ZIP is the most reliable.
  let m = a.match(/\b([A-Za-z]{2})\b[ ,]*\d{5}(?:-\d{4})?\b/);
  if (m && STATE_TZ[m[1].toUpperCase()]) return STATE_TZ[m[1].toUpperCase()];
  // 2) a spelled-out state name anywhere.
  const low = ` ${a.toLowerCase()} `;
  for (const [name, abbr] of Object.entries(STATE_NAMES)) if (low.includes(` ${name} `) || low.includes(`, ${name}`)) return STATE_TZ[abbr] ?? null;
  // 3) any bare 2-letter state token (last one wins — usually nearest the ZIP).
  const toks = a.toUpperCase().match(/\b[A-Z]{2}\b/g) || [];
  for (let i = toks.length - 1; i >= 0; i--) if (STATE_TZ[toks[i]]) return STATE_TZ[toks[i]];
  return null;
}

/** Is it 9pm–8am right now in this IANA zone? */
function isQuietInZone(tz: string, d: Date): boolean {
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(d));
    return hour >= 21 || hour < 8;
  } catch { return false; }
}
function localLabel(tz: string, d: Date): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(d);
}

// 🕐 Lead's local time + zone abbreviation + an east→west priority rank (Jon 2026-10-29:
// work the East Coast first — they're ahead of us — then move west). Lower rank = more east
// = work sooner. Returns null for an unknown area code.
const TZ_ABBR: Record<string, string> = { [E]: "ET", [C]: "CT", [M]: "MT", [MA]: "MST", [P]: "PT", [AK]: "AKT", [H]: "HT" };
const TZ_RANK: Record<string, number> = { [E]: 0, [C]: 1, [M]: 2, [MA]: 2, [P]: 3, [AK]: 4, [H]: 5 };
export function localTimeForPhone(phone: string, nowMs: number = Date.now()): { time: string; abbr: string; rank: number } | null {
  const tz = tzForPhone(phone);
  if (!tz) return null;
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(nowMs)).replace(/\s/g, "").toLowerCase();
  return { time, abbr: TZ_ABBR[tz] ?? "", rank: TZ_RANK[tz] ?? 9 };
}

/** Returns a human warning when it's quiet hours (9pm–8am) where the lead lives, else null.
 *  Judges by BOTH the phone area code AND the lead's address (Jon 2026-11-05) and blocks if
 *  EITHER zone is in quiet hours — the most compliant read when a ported number and the
 *  address disagree about where the person actually is. `nowMs` lets the caller pass a
 *  CLOCK-SKEW-CORRECTED time (server-trusted) so a wrong device clock can't bypass it. */
export function quietHoursWarning(phone: string, address?: string | null, fallbackTz?: string, nowMs?: number): string | null {
  const phoneTz = tzForPhone(phone);
  const addrTz = tzForAddress(address);
  // Zones to check: whatever we know. If we know neither, fall back to the org zone (safer to
  // apply a window than none). De-dupe so we don't report the same zone twice.
  const zones = [...new Set([phoneTz, addrTz].filter(Boolean) as string[])];
  if (!zones.length && fallbackTz) zones.push(fallbackTz);
  if (!zones.length) return null;
  const d = new Date(nowMs ?? Date.now());
  for (const tz of zones) {
    if (isQuietInZone(tz, d)) {
      const src = tz === addrTz && tz !== phoneTz ? "by address" : tz === phoneTz && tz !== addrTz ? "by area code" : "local";
      return `It's ${localLabel(tz, d)} ${src === "local" ? "where this lead lives" : src} (${tz.split("/")[1]?.replace("_", " ")}) — quiet hours are 9pm–8am. Blocked to keep us compliant.`;
    }
  }
  return null;
}
