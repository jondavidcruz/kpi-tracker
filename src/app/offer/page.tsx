"use client";

import { useState, type FormEvent } from "react";
import { CONSENT_TEXT, CONSENT_FOOTNOTE } from "@/lib/sms-consent";

const CONTACT_CONSENT_TEXT = "I agree that Freedom Offers LLC may contact me by phone and email about my property inquiry, and I accept the Privacy Policy and Terms of Service.";

// Public private-offer form. Embedded on freedom-offers.com (iframe) and
// reachable directly. Posts to /api/intake/website-lead.
export default function OfferPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [ptype, setPtype] = useState("home");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = {
      firstName: fd.get("firstName"),
      lastName: fd.get("lastName"),
      apn: fd.get("apn"),
      priceWanted: fd.get("priceWanted"),
      contactConsent: fd.get("contactConsent") ? true : false,
      phone: fd.get("phone"),
      email: fd.get("email"),
      address: fd.get("address"),
      propertyType: fd.get("propertyType"),
      motivation: fd.get("motivation"),
      company_website: fd.get("company_website"),
      smsConsent: fd.get("smsConsent") ? true : false,
    };
    try {
      const res = await fetch("/api/intake/website-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Please try again or call 1-877-652-8991.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <main className="mx-auto max-w-lg px-4 py-10 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Thank you.</h1>
        <p className="mt-3 text-slate-700">
          We received your request and will prepare your private offer within 24 hours.
        </p>
      </main>
    );
  }

  const input = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900";
  const label = "block text-sm font-medium text-slate-800";

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Request your private offer</h1>
      <p className="mt-1 text-sm text-slate-600">Share a few details. We will prepare your offer within 24 hours.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label} htmlFor="firstName">First name *</label>
            <input id="firstName" name="firstName" required autoComplete="given-name" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="lastName">Last name *</label>
            <input id="lastName" name="lastName" required autoComplete="family-name" className={input} />
          </div>
        </div>
        <div>
          <label className={label} htmlFor="phone">Mobile phone *</label>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="address">Property address *</label>
          <input id="address" name="address" required autoComplete="street-address" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="propertyType">Property type</label>
          <select id="propertyType" name="propertyType" value={ptype} onChange={(e) => setPtype(e.target.value)} className={input}>
            <option value="home">Home</option>
            <option value="land">Land</option>
          </select>
        </div>
        {ptype === "land" && (
          <div>
            <label className={label} htmlFor="apn">Parcel Number / APN (if you have it)</label>
            <input id="apn" name="apn" autoComplete="off" className={input} placeholder="e.g. 123-456-789" />
          </div>
        )}
        <div>
          <label className={label} htmlFor="priceWanted">Price you&apos;d like to get ($)</label>
          <input id="priceWanted" name="priceWanted" inputMode="numeric" className={input} placeholder="e.g. 85,000" />
        </div>
        <div>
          <label className={label} htmlFor="motivation">Anything we should know? (optional)</label>
          <textarea id="motivation" name="motivation" rows={3} className={input} />
        </div>

        {/* Honeypot: hidden from people, filled in by bots. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="company_website">Company website</label>
          <input id="company_website" name="company_website" tabIndex={-1} autoComplete="off" />
        </div>

        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="contactConsent" className="mt-1 h-4 w-4" />
          <span>{CONTACT_CONSENT_TEXT}</span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" name="smsConsent" className="mt-1 h-4 w-4" />
          <span>{CONSENT_TEXT}</span>
        </label>
        <p className="text-xs text-slate-500">{CONSENT_FOOTNOTE}</p>

        {status === "error" && <p role="alert" className="text-sm text-red-700">{error}</p>}

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : "Request a private offer"}
        </button>
      </form>
    </main>
  );
}
