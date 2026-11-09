// Public terms of service — reachable without login (listed in PUBLIC_PATHS) so it
// can back the Google OAuth consent screen's "Terms of service" link. Plain server
// component; renders bare for logged-out visitors.
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — Freedom Offers War Room",
  description: "Terms for authorized use of the Freedom Offers War Room.",
};

const UPDATED = "November 9, 2026";

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 text-slate-800">
      <div className="mb-8 inline-flex flex-col rounded-xl bg-[#0b1f3a] px-6 py-4 text-center">
        <span className="font-serif text-xl tracking-[0.2em] text-white" style={{ fontFamily: "var(--font-display)" }}>
          FREEDOM OFFERS
        </span>
        <span className="text-[10px] font-semibold tracking-[0.35em] text-amber-300">WAR ROOM</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Terms of Service</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated {UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <section>
          <p>
            The Freedom Offers War Room (the “App”) is a private, internal business application operated by
            Freedom Offers. Access is provided only to authorized team members for the purpose of doing their
            work for the business.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Authorized use</h2>
          <p className="mt-2">
            You may use the App only if you have been granted an account by Freedom Offers, and only for
            legitimate business purposes. You agree to keep your login secure, to use the App in accordance with
            company policies and applicable law, and not to share, copy, or export confidential information
            except as part of your authorized duties.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Accounts and access</h2>
          <p className="mt-2">
            Accounts are issued and may be suspended or removed by Freedom Offers at any time, with or without
            notice, including when someone’s role or employment ends. Information in the App is confidential and
            remains the property of the business.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">No warranty</h2>
          <p className="mt-2">
            The App is provided “as is,” without warranties of any kind. Freedom Offers is not liable for any
            loss arising from use of, or inability to use, the App, to the fullest extent permitted by law.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Contact</h2>
          <p className="mt-2">
            Questions about these terms? Email{" "}
            <a className="font-medium text-[#0b1f3a] underline" href="mailto:info@freedom-offers.com">
              info@freedom-offers.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-slate-200 pt-4 text-sm">
        <Link className="text-[#0b1f3a] underline" href="/privacy">
          Privacy Policy
        </Link>
      </div>
    </main>
  );
}
