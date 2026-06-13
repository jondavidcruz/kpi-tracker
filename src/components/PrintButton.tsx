"use client";

// Triggers the browser's print dialog (→ "Save as PDF"). Hidden when printing.
export default function PrintButton({ label = "🖨 Save as PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-2"
    >
      {label}
    </button>
  );
}
