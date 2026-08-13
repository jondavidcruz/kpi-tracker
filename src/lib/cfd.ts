// Contract-for-Deed / owner-finance notes ledger (kept out of "use server").
// Stored as a JSON array in Resource __cfd_notes__ (no migration).

export type CfdNote = {
  id: string;
  parcel: string;
  buyer: string;
  downPayment?: number;
  monthlyAmount?: number;
  rate?: number;      // annual %
  term?: number;      // years
  nextDue?: string;   // YYYY-MM-DD
  status: string;     // current | late | defaulted | paid_off
  taxesInvoiced?: boolean;
  notes?: string;
};

export const CFD_STATUSES = ["current", "late", "defaulted", "paid_off"];

export function cfdStatusMeta(s: string): { label: string; cls: string } {
  switch (s) {
    case "late": return { label: "Late", cls: "bg-amber-100 text-amber-800" };
    case "defaulted": return { label: "Defaulted", cls: "bg-red-100 text-red-800" };
    case "paid_off": return { label: "Paid off", cls: "bg-emerald-100 text-emerald-800" };
    default: return { label: "Current", cls: "bg-sky-100 text-sky-800" };
  }
}
