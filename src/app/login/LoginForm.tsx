"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [showLink, setShowLink] = useState(false);
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus("signing");
    setError("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      // Full navigation so the server picks up the new session cookie.
      window.location.assign(next);
    }
  }

  async function sendLink() {
    setStatus("sending");
    setError("");
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
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
        <div className="rounded-2xl bg-brand-navy px-10 py-7 text-center">
          <Logo size="lg" tagline />
        </div>
      </div>

      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {status === "sent" ? (
          <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <MailCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <span>Check your email — we sent a one-tap sign-in link to <strong>{email}</strong>. Open it on this device.</span>
          </div>
        ) : (
          <form onSubmit={signIn} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">Work email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@freedom-offers.com"
                autoComplete="email"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <button
              disabled={status === "signing"}
              className="w-full rounded-lg bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-navy-2 disabled:opacity-60"
            >
              {status === "signing" ? "Signing in…" : "Sign in"}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="border-t border-slate-100 pt-3 text-center">
              {showLink ? (
                <button
                  type="button"
                  onClick={sendLink}
                  disabled={status === "sending"}
                  className="text-xs font-semibold text-brand-navy hover:underline disabled:opacity-60"
                >
                  {status === "sending" ? "Sending…" : "Email me a one-time sign-in link instead"}
                </button>
              ) : (
                <button type="button" onClick={() => setShowLink(true)} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
                  Trouble signing in? Forgot password?
                </button>
              )}
              {showLink && <p className="mt-1 text-[11px] text-slate-400">Use the email link once, then ask Jon to set/reset your password.</p>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
