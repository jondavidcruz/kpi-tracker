"use client";
// One button = one browser call: hands the number to the softphone (DialPad
// must be mounted on the same page). Never falls back to tel:/cell.
export default function CallButton({ phone, name, oppId, contactId, label = "📞 Call", subtle = false }: { phone: string; name?: string; oppId?: string; contactId?: string; label?: string; subtle?: boolean }) {
  return (
    <button
      type="button"
      title={`Call ${name ?? phone} from your browser (Telnyx)`}
      onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone, name, oppId, contactId } }))}
      className={subtle
        ? "rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
        : "rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"}
    >
      {label}
    </button>
  );
}
