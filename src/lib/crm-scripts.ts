// Condensed, field-aligned call scripts shown INSIDE the CRM edit modal, beside the
// Home Details / Land Details fields. This is the "foundations" version (not word-for-
// word) — its blocks run in the SAME order as the form fields so a rep reads straight
// down the panel while filling in the tab. The full study scripts live on /scripts
// (src/lib/scripts-data.ts); keep these short. Line prefixes drive styling in
// ScriptPanel: 🎤 = say, ❓ = ask, 💡 = tip, ⚠️ = warning, → = coaching note.
//
// Home Details follows Eric Klein's Fix & Flip seller flow. Land follows the land flow.
// To extend to other sections later (Dispo Buyers & Offers, Closing & Escrow), add a
// new key here and allow it in ScriptPanel + CrmQuickView's render gate.

export type ScriptBlock = { heading: string; lines: string[] };

export const CRM_SCRIPTS: Record<"property" | "land", ScriptBlock[]> = {
  // 🏡 Home Details — Fix & Flip / Traditional seller
  property: [
    {
      heading: "🤝 Rapport first — before the house",
      lines: [
        "⚠️ Don't dive into the property. Win the first 2–3 minutes on THEM. People sell to people they like.",
        "❓ How long have you been in the home? … How'd you end up in that area?",
        "→ Let them talk more than you. Find one real thing to connect on, then move on.",
      ],
    },
    {
      heading: "Confirm the property  →  Address · APN",
      lines: [
        "🎤 I'm pulling it up now — looks like the place on [street]. Just making sure I've got the right one. That right?",
        "→ Confirm what's on your map; don't interrogate.",
      ],
    },
    {
      heading: "Their situation & motivation  →  Ready to sell · Motivation · How long · Agent · $ wanted · Offers · Creative · Occupancy · Timeline",
      lines: [
        "❓ Is selling something you're ready to do, or just exploring?",
        "❓ What's got you thinking about it — and how long have you owned it?",
        "❓ Ever listed it with an agent?",
        "❓ Is there a number that'd make it worth it for you?",
        "❓ Gotten any offers on it?",
        "🎤 We're flexible — cash and a fast close, or terms if that nets you more.",
        "❓ Is it vacant, owner-occupied, or is there a tenant?",
        "❓ Any timeline that matters, or no rush?",
      ],
    },
    {
      heading: "The basics — confirm, don't ask  →  Year built · Sqft / beds / baths",
      lines: [
        "🎤 I've got it as a [#]bd/[#]ba, about [###] sqft, built in [year] — does that line up?",
        "→ Beds/baths/sqft/year are on your comps already. Confirming them signals you did your homework.",
      ],
    },
    {
      heading: "Condition — big-ticket items  →  Roof · HVAC · Water heater · Foundation · Plumbing/electric · Kitchen & baths · Repairs · If tenant · Condition",
      lines: [
        "🎤 I just need a feel for condition so underwriting can price it. Mind walking me through the big stuff?",
        "❓ Roof — about how old, or when last replaced?",
        "❓ HVAC / furnace — what's the age?",
        "❓ Water heater — original or swapped out?",
        "❓ Foundation — any cracks or settling?",
        "❓ Plumbing & electrical — updated or original?",
        "❓ Kitchen & baths — last updated?",
        "→ Get the AGE/YEAR on each — that's exactly what underwriting needs.",
        "❓ What would it need to sell retail? (their words, then your $ guess)",
        "❓ If there's a tenant — rent, lease end, are they paying?",
        "🎤 Anything else major I wouldn't see on paper? → then set the overall condition.",
      ],
    },
    {
      heading: "Soft close  →  run it by underwriting + get the email",
      lines: [
        "🎤 Let me take this to our underwriters and come back with what it qualifies for. No obligation — just real numbers.",
        "🎤 Best email to send that to?",
        "→ Always get the email. Thank them and reference something they shared.",
      ],
    },
  ],
  // 🏞️ Land Details — vacant land seller
  land: [
    {
      heading: "🤝 Rapport first — before the parcel",
      lines: [
        "⚠️ Don't jump to the lot. Land sellers are often out-of-state or inherited it — there's a story. Get it.",
        "❓ How'd you come to own the land out there? … Ever been out to see it?",
        "→ Let them talk. Make it a conversation, not a survey.",
      ],
    },
    {
      heading: "Confirm the parcel  →  Address · APN",
      lines: [
        "🎤 I'm pulling it up now — the parcel out in [county/area]. Making sure I've got the right piece. Sound right?",
        "→ Confirm what's on your map.",
      ],
    },
    {
      heading: "Situation & why selling  →  Ready to sell · Motivation · How long · Agent · $ wanted · Offers · Creative · Occupancy · Timeline",
      lines: [
        "❓ Ready to sell, or just exploring?",
        "❓ What's got you thinking about letting it go — and how long have you owned it?",
        "❓ Ever listed it with an agent?",
        "❓ A number in mind that'd make it worth it?",
        "❓ Gotten any offers on it?",
        "🎤 We can pay cash and close fast, or do terms if that nets you more.",
        "❓ Anyone living on it or using it right now?",
        "❓ Any timeline, or no rush?",
      ],
    },
    {
      heading: "Size & access  →  Acres · Legal/road access · Easements · Topography · Zoning",
      lines: [
        "❓ How many acres, roughly?",
        "❓ Is there legal road access — can you drive right up, or is it landlocked?",
        "❓ Any easements or shared roads?",
        "❓ Mostly flat, sloped, wooded?",
        "❓ Know what it's zoned for — residential, ag, recreational?",
      ],
    },
    {
      heading: "Restrictions & hazards  →  Flood · Wetlands · Hazards · HOA/POA",
      lines: [
        "❓ Any of it in a flood zone or wetlands you know of?",
        "❓ Anything else a buyer should know — fire area, power lines?",
        "❓ Is there an HOA or POA with dues or restrictions?",
      ],
    },
    {
      heading: "What can you do with it — the sell-points  →  Build · RV · Camping · STR · Development",
      lines: [
        "💡 More \"yes\" answers = more our buyers will pay. Get them all.",
        "❓ Can you build? Any min/max size on a home?",
        "❓ Can you park an RV or camp out there — how long?",
        "❓ Short-term rental / Airbnb allowed?",
        "❓ What could someone develop or use it for?",
      ],
    },
    {
      heading: "Features & utilities  →  Utilities · Features · Anything special",
      lines: [
        "❓ Power, water, or septic nearby — or is it raw?",
        "❓ Standout features — water frontage, views, paved road, corner lot, cleared?",
        "❓ Anything special about this piece I should know?",
      ],
    },
    {
      heading: "Soft close  →  run it by underwriting + get the email",
      lines: [
        "🎤 Let me run this past underwriting and come back with what it qualifies for. No obligation.",
        "🎤 Best email to send that to?",
        "→ Always get the email. Thank them and reference something they shared.",
      ],
    },
  ],
};
