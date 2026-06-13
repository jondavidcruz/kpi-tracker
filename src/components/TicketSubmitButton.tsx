"use client";

import { useFormStatus } from "react-dom";

// Disables itself and shows progress the moment it's clicked, so an unresponsive
// first click can't be mashed into duplicate tickets.
export default function TicketSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Submitting…" : "Submit ticket"}
    </button>
  );
}
