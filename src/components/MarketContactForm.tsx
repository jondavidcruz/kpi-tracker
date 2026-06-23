"use client";

import { useState } from "react";
import { saveMarketContact } from "@/app/actions";
import MultiSelect from "@/components/MultiSelect";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-0.5 block text-[11px] font-semibold text-slate-500";
const sectionCls = "sm:col-span-4 mt-1 border-t border-slate-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400";

const PREFERRED_CONTACT = ["Phone call", "Text / SMS", "Email", "Instagram DM", "WhatsApp"];
const DEAL_TYPE = ["Land / lots", "Teardown", "Entitled lots", "Off-market", "JV / partnership", "Build-to-rent"];
const BUILD_TYPE = ["SFR", "Townhomes", "Multifamily", "Mixed-use", "Custom luxury", "Spec homes"];
const SPEED = ["Cash, < 14 days", "15–30 days", "30–45 days", "Financed"];
const DECISION_MAKER = ["Direct / principal", "Acquisitions manager", "Agent / broker", "Not direct (B-rated)"];
const BUYING_FREQ = ["1+ / week", "1–3 / month", "A few / quarter", "Opportunistic"];
const PROPERTY_TYPE = ["SFR", "Condo / Townhome", "Small multi (2–4)", "Mobile / Manufactured", "Any"];
const CONDITION = ["Any / teardown OK", "Heavy rehab", "Light–moderate", "Turnkey only"];
const NEEDS_VIEW = ["No — offers sight-unseen", "Yes — needs walkthrough", "Sometimes"];
const VET_STAGES: [string, string][] = [["to_vet", "To vet"], ["vetted", "Vetted"], ["active", "Active buyer"], ["hold", "On hold"], ["dead", "Dead"]];

type CD = { id?: string } & Record<string, string | number | null | undefined>;

function val(c: CD | undefined, k: string): string {
  const v = c?.[k];
  return v === null || v === undefined ? "" : String(v);
}

function Inp({ name, label, c, span, placeholder, type }: { name: string; label: string; c?: CD; span?: number; placeholder?: string; type?: string }) {
  return (
    <label className={span === 2 ? "sm:col-span-2" : span === 4 ? "sm:col-span-4" : ""}>
      <span className={labelCls}>{label}</span>
      <input name={name} type={type} defaultValue={val(c, name)} placeholder={placeholder} className={inputCls} />
    </label>
  );
}
function Sel({ name, label, c, options, span }: { name: string; label: string; c?: CD; options: string[]; span?: number }) {
  return (
    <label className={span === 2 ? "sm:col-span-2" : ""}>
      <span className={labelCls}>{label}</span>
      <select name={name} defaultValue={val(c, name)} className={inputCls}>
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default function MarketContactForm({ c, defaultCategory }: { c?: CD; defaultCategory?: string }) {
  const [category, setCategory] = useState<string>(val(c, "category") || defaultCategory || "distressed");
  const isDev = category === "luxury";

  return (
    <form action={saveMarketContact} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
      {c?.id && <input type="hidden" name="id" value={c.id} />}

      <div className={sectionCls}>Contact</div>
      <label className="sm:col-span-2"><span className={labelCls}>Contact name *</span><input name="name" defaultValue={val(c, "name")} className={inputCls} required /></label>
      <label><span className={labelCls}>Category</span>
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
          <option value="luxury">Luxury / Developer</option>
          <option value="distressed">Distressed / Flipper</option>
        </select>
      </label>
      <Inp name="title" label="Title / role" c={c} />
      <Inp name="company" label={isDev ? "Company / Dev firm" : "Company"} c={c} span={2} />
      <MultiSelect name="preferredContact" label="Preferred contact method" defaultValue={val(c, "preferredContact")} options={PREFERRED_CONTACT} labelCls={labelCls} />
      <label><span className={labelCls}>Vetting stage</span>
        <select name="vetStage" defaultValue={val(c, "vetStage") || "to_vet"} className={inputCls}>
          {VET_STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <Inp name="status" label="Status tag" c={c} />
      <Inp name="phone" label="Phone" c={c} />
      <Inp name="email" label="Email" c={c} />
      <Inp name="igHandle" label="Instagram" c={c} placeholder="@handle" />
      <Inp name="website" label="Website" c={c} />

      {isDev ? (
        <>
          <div className={sectionCls}>Developer buy box</div>
          <MultiSelect name="dealType" label="Deal type (pick all)" defaultValue={val(c, "dealType")} options={DEAL_TYPE} labelCls={labelCls} />
          <MultiSelect name="buildType" label="Build type (pick all)" defaultValue={val(c, "buildType")} options={BUILD_TYPE} labelCls={labelCls} />
          <Sel name="closingSpeed" label="Move speed" c={c} options={SPEED} />
          <Inp name="priceRange" label="Price range per lot" c={c} placeholder="$400k–$700k" />
          <Inp name="minLotSize" label="Minimum lot size" c={c} placeholder="7,000 sf" />
          <Inp name="buyBoxAreas" label="🎯 Target geography (counties / cities — searched by the map)" c={c} span={2} placeholder="Newport Beach, Irvine…" />
        </>
      ) : (
        <>
          <div className={sectionCls}>Fix / flip buy box</div>
          <Inp name="buyBoxAreas" label="🎯 Preferred markets (searched by the map)" c={c} span={2} placeholder="La Jolla, Clairemont…" />
          <Inp name="priceRange" label="Price range buy box" c={c} placeholder="$300k–$800k" />
          <MultiSelect name="propertyType" label="Property type (pick all)" defaultValue={val(c, "propertyType")} options={PROPERTY_TYPE} labelCls={labelCls} />
          <Inp name="minBeds" label="Minimum bedrooms" c={c} />
          <Inp name="maxBaths" label="Maximum bathrooms" c={c} />
          <MultiSelect name="conditionTolerance" label="Condition tolerance (pick all)" defaultValue={val(c, "conditionTolerance")} options={CONDITION} labelCls={labelCls} />
          <Sel name="closingSpeed" label="Closing speed" c={c} options={SPEED} />
          <Sel name="needsView" label="Needs to view before offer?" c={c} options={NEEDS_VIEW} />
          <Inp name="marketDetails" label="Market details" c={c} span={2} />
        </>
      )}

      <div className={sectionCls}>Qualification & outreach</div>
      <Sel name="decisionMaker" label="Decision maker? (not direct → B-rated)" c={c} options={DECISION_MAKER} span={2} />
      <Sel name="buyingFrequency" label="Buying frequency" c={c} options={BUYING_FREQ} span={2} />
      <Inp name="bestContact" label="Best way to reach (sequence)" c={c} span={2} placeholder="IG DM → email → call" />
      <Inp name="lastContacted" label="Last contacted" c={c} type="date" />
      <Inp name="nextFollowUp" label="Next follow-up" c={c} type="date" />
      <label className="sm:col-span-4"><span className={labelCls}>Outreach log (touches, replies, next step)</span><textarea name="outreachLog" defaultValue={val(c, "outreachLog")} rows={2} className={inputCls} /></label>
      <Inp name="notes" label="Notes" c={c} span={2} />
      <Inp name="region" label="Region (SD / OC / LA)" c={c} />
      <Inp name="market" label="Market / city" c={c} />
      <Inp name="lat" label="Lat (map pin)" c={c} type="number" />
      <Inp name="lng" label="Lng (map pin)" c={c} type="number" />

      <div className="sm:col-span-4"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">{c?.id ? "Save" : "Add buyer"}</button></div>
    </form>
  );
}
