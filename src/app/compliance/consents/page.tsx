import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// 🧾 Consent Vault (Jon 2026-10-08: "where do we store the opt-ins in case we
// ever get sued?"). Every website-form submission logs a consent event with
// the EXACT checkbox text, version, timestamp, IP and device — this page is
// the court-ready view. Records are never edited or deleted.
export default async function ConsentVaultPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) return <Card className="p-10 text-center text-slate-400">🔒 Managers only.</Card>;

  const events = await db.crmEvent.findMany({
    where: { meta: { path: ["type"], equals: "sms_consent" } },
    orderBy: { at: "desc" },
    take: 500,
  });
  const contactIds = [...new Set(events.map((e) => e.contactId))];
  const contacts = await db.crmContact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true, phone: true, email: true } });
  const cmap = new Map(contacts.map((c) => [c.id, c]));
  type Meta = { granted?: boolean; contactConsent?: boolean; consentVersion?: string; consentText?: string; phone?: string; sourcePage?: string; ip?: string; userAgent?: string };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="🧾 Consent Vault"
        subtitle="Every opt-in ever captured on our forms — exact wording, version, timestamp, IP and device. This is the record that protects us if anyone ever claims they didn't opt in. Print (Cmd+P) for a dated copy."
        accent="bg-emerald-500"
        right={<Link href="/compliance" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🛡 Back to Compliance</Link>}
      />
      <Card className="p-4 text-xs text-slate-500">
        ⚖️ How this holds up: the form checkbox is <b>not pre-checked</b>, the full consent text is stored word-for-word with a version stamp, and each record carries the submission IP + browser. A "STOP" reply additionally opts them out in Telnyx. Records here are append-only — nothing is ever edited or deleted.
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500 [&>th]:px-3 [&>th]:py-2">
              <th>When</th><th>Lead</th><th>Phone</th><th>SMS consent</th><th>Contact consent</th><th>Version</th><th>Source page</th><th>IP</th><th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const m = (e.meta ?? {}) as Meta;
              const c = cmap.get(e.contactId);
              return (
                <tr key={e.id} className="border-b border-slate-50 align-top hover:bg-slate-50/50 [&>td]:px-3 [&>td]:py-2">
                  <td className="whitespace-nowrap text-slate-500">{e.at.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" })}</td>
                  <td className="font-semibold text-slate-800">{c?.name ?? "—"}</td>
                  <td className="font-mono text-slate-600">{m.phone || c?.phone || "—"}</td>
                  <td>{m.granted ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 ring-1 ring-emerald-200">✓ GIVEN</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">not given</span>}</td>
                  <td>{m.contactConsent ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-700 ring-1 ring-emerald-200">✓ GIVEN</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-500">not given</span>}</td>
                  <td className="text-slate-500">{m.consentVersion ?? "—"}</td>
                  <td className="max-w-[140px] truncate text-slate-500">{m.sourcePage ?? "—"}</td>
                  <td className="font-mono text-slate-400">{m.ip ?? "—"}</td>
                  <td>
                    <details>
                      <summary className="cursor-pointer font-bold text-indigo-600">view</summary>
                      <div className="mt-1 max-w-md whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[10px] text-slate-600 ring-1 ring-slate-100">
                        <b>Exact consent text shown:</b> {m.consentText ?? "—"}
                        {m.userAgent && <><br /><b>Device:</b> {m.userAgent}</>}
                      </div>
                    </details>
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-slate-400">No consent records yet — they appear the moment someone submits the website form.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
