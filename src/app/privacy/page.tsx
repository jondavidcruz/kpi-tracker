// Public privacy policy — reachable without login (listed in PUBLIC_PATHS) so it
// can back the Google OAuth consent screen's "Privacy policy" link. Plain server
// component; renders bare for logged-out visitors (AppShell returns children when
// there's no user).
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Freedom Offers War Room",
  description: "How the Freedom Offers War Room handles sign-in and team data.",
};

const UPDATED = "November 9, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 text-slate-800">
      <div className="mb-8 inline-flex flex-col rounded-xl bg-[#0b1f3a] px-6 py-4 text-center">
        <span className="font-serif text-xl tracking-[0.2em] text-white" style={{ fontFamily: "var(--font-display)" }}>
          FREEDOM OFFERS
        </span>
        <span className="text-[10px] font-semibold tracking-[0.35em] text-amber-300">WAR ROOM</span>
      </div>

      <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500">Last updated {UPDATED}</p>

      <div className="mt-6 space-y-6 text-sm leading-relaxed">
        <section>
          <p>
            The Freedom Offers War Room (the “App”) is a private, internal business application operated by
            Freedom Offers for its authorized team members. It is not a consumer product and is not open to the
            public. This policy explains what information the App collects and how it is used.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Sign-in information.</strong> When you sign in with Google, we receive your name and email
              address from your Google Account. When you sign in by email link, we receive your email address.
            </li>
            <li>
              <strong>Work data you enter.</strong> Information authorized team members add while doing their
              jobs — such as KPIs, notes, tasks, and deal records — is stored to operate the business.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">How we use it</h2>
          <p className="mt-2">
            We use this information only to sign you in, confirm you are an authorized team member, control what
            you can access, and run the internal operations of the business. We do not sell your personal
            information, and we do not share it with third parties for advertising.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Google user data</h2>
          <p className="mt-2">
            If you choose “Sign in with Google,” the App requests only your basic profile (name) and email
            address, solely to authenticate you and match you to your team account. We do not request access to
            any other Google data, and we do not use Google data for any purpose other than sign-in.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Access, retention, and security</h2>
          <p className="mt-2">
            Access to the App is limited to authorized team members and may be revoked at any time. Data is
            retained for as long as needed to operate the business and is protected with industry-standard
            safeguards through our hosting and authentication providers.
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold text-slate-900">Contact</h2>
          <p className="mt-2">
            Questions about this policy? Email{" "}
            <a className="font-medium text-[#0b1f3a] underline" href="mailto:info@freedom-offers.com">
              info@freedom-offers.com
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-10 border-t border-slate-200 pt-4 text-sm">
        <Link className="text-[#0b1f3a] underline" href="/terms">
          Terms of Service
        </Link>
      </div>
    </main>
  );
}
