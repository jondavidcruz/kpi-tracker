// ⬇️ CSV of the UNVETTED developers, formatted for a DirectREI bulk upload (Jon 2026-10-30:
// "we need Company Name, First/Last/Full Name, Email 1-3, Phone 1-3, Market"). The whole
// DS: Developers pipeline minus the ✅ Vetted / ✕ Not-a-fit stages. C-suite only (never widen).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
// Names that read like a company (so we know whether to put the name in Company vs First/Last).
const COMPANYISH = /(llc|l\.l\.c|inc\b|corp|\bco\b|homes?|builder|building|construction|develop|properties|property|group|capital|holdings|ventures|realty|investments|\bland\b|partners|team|enterprises|associates|contracting)/i;
const US_STATE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;

/** Pull up to 3 unique non-empty values from the given seeds + any phone/email-like fields in formData. */
// Normalize a US phone to one consistent format: (XXX) XXX-XXXX (falls back to the raw string).
function fmtPhone(s: string): string {
  const d = String(s ?? "").replace(/\D/g, "");
  const t = d.length === 11 && d[0] === "1" ? d.slice(1) : d;
  return t.length === 10 ? `(${t.slice(0, 3)}) ${t.slice(3, 6)}-${t.slice(6)}` : String(s ?? "").trim();
}

function collect(seeds: Array<unknown>, fd: Record<string, unknown>, kind: "phone" | "email"): [string, string, string] {
  const out: string[] = [];
  const add = (v: unknown) => {
    // One field can hold several values joined by | , ; / or newlines — split them out so they
    // land in separate 1/2/3 columns (Jon 2026-10-30), but keep a single-spaced phone intact.
    for (const partRaw of String(v ?? "").split(/[|;,/\n]+|\s{2,}/)) {
      const s = partRaw.trim();
      if (!s) continue;
      const formatted = kind === "phone" ? fmtPhone(s) : s;
      const norm = kind === "phone" ? s.replace(/\D/g, "") : s.toLowerCase();
      if (!norm || (kind === "phone" && norm.length < 7) || (kind === "email" && !s.includes("@"))) continue;
      if (!out.some((x) => (kind === "phone" ? x.replace(/\D/g, "") : x.toLowerCase()) === norm)) out.push(formatted);
    }
  };
  for (const s of seeds) add(s);
  // scan formData (incl. nested one level) for extra phone*/email* string fields
  const re = kind === "phone" ? /phone|mobile|cell|tel\b/i : /email|e-?mail/i;
  const scan = (obj: unknown) => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (typeof v === "string" && re.test(k)) add(v);
      else if (v && typeof v === "object") for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) if (typeof v2 === "string" && re.test(k2)) add(v2);
    }
  };
  scan(fd);
  return [out[0] ?? "", out[1] ?? "", out[2] ?? ""];
}

export async function GET() {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — CSV export is restricted to the C-suite" }, { status: 403 });

  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const opps = net.dev.length ? await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.dev }, stage: { notIn: ["vetted", "not_fit"] } },
    select: { title: true, formData: true, contact: { select: { name: true, phone: true, altPhone: true, email: true, altEmail: true, address: true, pinnedNote: true } } },
    orderBy: { createdAt: "desc" },
  }) : [];

  // Pull a city from free-text (notes / area / mailing address) when we have one.
  const cityFrom = (...texts: string[]): string => {
    for (const t of texts) {
      const s = (t || "").trim();
      if (!s) continue;
      // "City, ST" or "in <City> County" or "<City>, FL 33948"
      const m = s.match(/([A-Z][A-Za-z.\- ]+?),\s*(?:[A-Z]{2})\b/) || s.match(/\bin\s+([A-Z][A-Za-z.\- ]+?)\s+County\b/i) || s.match(/\bin\s+([A-Z][A-Za-z.\- ]{2,30}?)(?:[,.]|\s+(?:FL|TX|CA|TN|OK)\b)/);
      if (m) return m[1].trim();
    }
    return "";
  };

  const header = ["Company Name", "First Name", "Last Name", "Full Name", "Email 1", "Email 2", "Email 3", "Phone 1", "Phone 2", "Phone 3", "Market"];
  const lines = opps.map((o) => {
    const fd = (o.formData ?? {}) as Record<string, unknown>;
    const imp = (fd.__import ?? {}) as { market?: string; city?: string; buyBox?: string };
    const src = (fd.__migratedSource ?? {}) as { market?: string; buyBoxAreas?: string; company?: string };
    const form = (fd.dev_buybox ?? {}) as { buyCounties?: string; brokerage?: string; decisionMaker?: string };

    const rawName = (o.contact?.name || o.title || "").trim();
    const brokerage = (src.company || form.brokerage || "").trim();
    const decision = (form.decisionMaker || "").trim();
    const isCo = COMPANYISH.test(rawName);
    // 🏢 Company Name ONLY when it's an actual LLC/company — not a person's name (Jon 2026-10-30).
    const companyName = brokerage || (isCo ? rawName : "");
    const personName = decision || (isCo ? "" : rawName); // company-named lead → person is the decision-maker
    const parts = personName.split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");

    const [e1, e2, e3] = collect([o.contact?.email, o.contact?.altEmail], fd, "email");
    const [p1, p2, p3] = collect([o.contact?.phone, o.contact?.altPhone], fd, "phone");

    const areas = (imp.market || src.market || form.buyCounties || src.buyBoxAreas || "").trim();
    const state = (areas.match(US_STATE)?.[0]) || "";
    const city = (imp.city || "").trim() || cityFrom(o.contact?.address ?? "", o.contact?.pinnedNote ?? "", imp.buyBox ?? "", areas);
    // 📍 One combined "City / ST" market column (Jon 2026-10-30).
    const market = city && state ? `${city} / ${state}` : (city || state || areas);

    return [companyName, firstName, lastName, personName, e1, e2, e3, p1, p2, p3, market].map(esc).join(",");
  });

  const csv = [header.map(esc).join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unvetted-developers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
