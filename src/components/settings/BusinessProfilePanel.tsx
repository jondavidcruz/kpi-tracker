import { db } from "@/lib/db";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { saveBizProfileAction } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

// 🏢 Business Profile — the company's legal identity in ONE place, C-suite editable.
// These values feed outbound email footers, compliance records and (post-GHL) A2P
// re-registration. Rendered both as a tab in the Settings hub (/admin#business) and at
// the legacy /settings/business route (Jon 2026-11-03: consolidate settings into one hub).
const BIZ_FIELDS: Array<{ key: string; label: string; def: string; wide?: boolean }> = [
  { key: "friendlyName", label: "Friendly business name", def: "Freedom-Offers.com" },
  { key: "legalName", label: "Legal business name (as on the EIN)", def: "Freedom Offers LLC" },
  { key: "email", label: "Business email", def: "info@freedom-offers.com" },
  { key: "phone", label: "Business phone", def: "+1 909-395-6195" },
  { key: "website", label: "Website", def: "https://freedom-offers.com/" },
  { key: "ein", label: "EIN / registration number", def: "931720023" },
  { key: "entityType", label: "Business type", def: "Limited Liability Company" },
  { key: "industry", label: "Industry / niche", def: "Real Estate" },
  { key: "address", label: "Physical address", def: "5830 E 2nd St, Ste 7000 #9789, Casper, Wyoming 82609, United States", wide: true },
  { key: "timezone", label: "Time zone", def: "America/Los_Angeles (PT)" },
  { key: "repName", label: "Authorized representative", def: "Jonathan Cruz" },
  { key: "repTitle", label: "Representative title", def: "CEO" },
  { key: "repEmail", label: "Representative email", def: "jon@freedom-offers.com" },
  { key: "repPhone", label: "Representative phone", def: "+1 909-395-6195" },
];

export default async function BusinessProfilePanel({ saved }: { saved?: boolean }) {
  const me = await getCurrentUser();
  if (!canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 C-suite only.</Card>;
  const row = await db.resource.findFirst({ where: { category: "__biz_profile__" } });
  let vals: Record<string, string> = {};
  try { vals = row?.description ? JSON.parse(row.description) : {}; } catch { /* defaults */ }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle title="🏢 Business Profile" subtitle="The company's legal identity — one source of truth for emails, compliance records and carrier registrations (A2P)." accent="bg-brand-navy" />
      {saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Saved.</div>}
      <Card className="p-5">
        <form action={saveBizProfileAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BIZ_FIELDS.map((f) => (
            <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
              <span className="mb-0.5 block text-[11px] font-bold text-slate-500">{f.label}</span>
              <input name={`b_${f.key}`} defaultValue={vals[f.key] ?? f.def} className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" />
            </label>
          ))}
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-navy-700">Update information</button>
          </div>
        </form>
      </Card>
    </div>
  );
}
