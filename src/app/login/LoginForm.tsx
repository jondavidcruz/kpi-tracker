"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Logo from "@/components/Logo";

// Flip to `true` only AFTER Google is configured in the Supabase dashboard
// (Authentication → Providers → Google) and a Google Cloud OAuth client is set up
// with the Supabase callback URL. Until then we hide the button so the team never
// sees a sign-in option that errors. (No env var — this is just a UI feature flag.)
const GOOGLE_LOGIN_ENABLED = true;

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

  async function googleSignIn() {
    setStatus("signing");
    setError("");
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser is redirected to Google; only an error returns here.
    if (error) {
      setError(error.message);
      setStatus("error");
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
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <MailCheck size={18} className="mt-0.5 shrink-0 text-emerald-600" />
              <span>Check your email — we sent a one-tap sign-in link to <strong>{email}</strong>. Open it on this device.</span>
            </div>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] leading-snug text-slate-500 ring-1 ring-slate-200">
              💡 Once you&apos;re in, go to <strong>Account</strong> (bottom of the sidebar) → <strong>Change my password</strong> to set a password. Then you can sign in with email + password next time and skip the link.
            </p>
          </div>
        ) : (
          <form onSubmit={signIn} className="space-y-4">
            {GOOGLE_LOGIN_ENABLED && (
              <>
                <button
                  type="button"
                  onClick={googleSignIn}
                  disabled={status === "signing"}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.3 34.8 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4 5.4l6.3 5.3C41.6 35.9 44 30.4 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
                  Sign in with Google
                </button>
                <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
                </div>
              </>
            )}
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
              {showLink && <p className="mt-1 text-[11px] text-slate-400">We&apos;ll email you a one-tap link. After you&apos;re in, set a password under <strong>Account → Change my password</strong> so you can skip the link next time.</p>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
