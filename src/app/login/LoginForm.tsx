"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-[88vh] flex-col items-center justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-2xl bg-brand-navy px-10 py-7">
          <Logo size="lg" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">KPI Performance Portal</p>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {status === "sent" ? (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <MailCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>Check your email. We sent a sign-in link to <strong>{email}</strong>. Open it on this device to log in.</span>
          </div>
        ) : (
          <form onSubmit={sendLink} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">
                Work email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@freedom-offers.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <button
              disabled={status === "sending"}
              className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-2 disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-center text-xs text-slate-400">
              No password needed. We email you a one-tap link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
