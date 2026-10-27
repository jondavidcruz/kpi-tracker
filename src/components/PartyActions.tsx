"use client";
// 🤝 Reach a deal party (title / escrow / attorney / listing agent) directly from
// the Parties card (Jon 2026-10-27): 📞 Call uses the in-app dialer, 💬 Text and
// ✉️ Email open the device's messaging/mail. Each button only shows when the party
// has that field. Parties aren't CRM contacts, so Call just dials the number.
export default function PartyActions({ phone, email, name, oppId }: { phone?: string; email?: string; name?: string; oppId?: string }) {
  const tel = String(phone || "").replace(/\.\d+$/, "").trim();
  const telDigits = tel.replace(/[^\d+]/g, "");
  const em = String(email || "").trim();
  if (!tel && !em) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {tel && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: tel, name: name || "party", oppId } }))}
          className="rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700"
          title={`Call ${name || tel} in the dialer`}
        >📞 Call</button>
      )}
      {tel && (
        <a href={`sms:${telDigits}`} className="rounded-md bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-sky-700" title={`Text ${tel}`}>💬 Text</a>
      )}
      {em && (
        <a href={`mailto:${em}`} className="rounded-md bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-indigo-700" title={`Email ${em}`}>✉️ Email</a>
      )}
    </div>
  );
}
