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

/** Returns a human warning when it's quiet hours (9pm–8am) where the lead lives, else null. */
export function quietHoursWarning(phone: string, fallbackTz?: string): string | null {
  const tz = tzForPhone(phone) ?? fallbackTz ?? null;
  if (!tz) return null;
  try {
    const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
    if (hour >= 21 || hour < 8) {
      const local = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date());
      return `It's ${local} where this lead lives (${tz.split("/")[1]?.replace("_", " ")}) — quiet hours are 9pm–8am. Call blocked to keep us compliant.`;
    }
    return null;
  } catch { return null; }
}
