// Auto-extracted from public/scripts/master-guide.html — the team's full call scripts.
export type ScriptStep = { heading: string; body: string[] };
export type ScriptObjection = { objection: string; response: string };
export type Script = {
  key: string;        // kebab-case unique id, e.g. "traditional-seller"
  name: string;       // human title, e.g. "Traditional / Fix & Flip Seller"
  group: string;      // one of: "Seller Scripts", "Buyer Scripts", "Agent Scripts"
  icon: string;       // a single emoji that fits
  summary: string;    // one short sentence on when to use this script
  steps: ScriptStep[];     // the ordered call flow; heading = the step title, body = the lines/paragraphs under it IN ORDER, copied verbatim
  objections: ScriptObjection[]; // any "Common Objections" for this script: the objection text + the exact rebuttal. Empty array if none.
};

export const SCRIPTS: Script[] = [
  {
    key: "traditional-seller",
    name: "Traditional / Fix & Flip Sellers",
    group: "Seller Scripts",
    icon: "🔨",
    summary: "For distressed homeowners, estates, and investors wanting out of lower-price-point properties needing work.",
    steps: [
      {
        heading: "1️⃣ Cold Opener — Build Credibility",
        body: [
          "🎤 Hey, [Name]? This is [Your Name] calling from Freedom Offers. We're a veteran-owned acquisition company based out of San Diego — we work directly with developers and buyers looking for off-market properties in your area. So here's the deal — we specialize in higher-end homes, completely private, no public listings, no open houses. And I'm not gonna waste your time with lowball offers, I promise. You got a quick minute?",
          "💡 If they ask \"what company?\" → Say: \"Freedom Offers — you can check us out at freedom-offers.com. We work with developers to find off-market properties before they ever hit the market. You can also call us at (877) 652-8991 if you want to verify.\"",
        ],
      },
      {
        heading: "1️⃣ Warm Opener — Follow-Up from Previous Contact",
        body: [
          "🎤 Hey, [Name]? This is [Your Name] with Freedom Offers. So my team talked to you previously about [address] and mentioned you might possibly be looking to sell. Do you have about 5 mins?",
          "💡 Use this when your team has already made contact or they've engaged with you before. Skips the credibility setup — they know who you are. Go straight to property.",
        ],
      },
      {
        heading: "2️⃣ Why You're Calling",
        body: [
          "🎤 So the reason I'm reaching out — we've got a group of developers and buyers right now actively looking for properties in your area. Yours came up as a potential fit. I'm not here to pressure you into anything — I just wanted to see if a private, off-market option is something you'd ever consider.",
        ],
      },
      {
        heading: "3️⃣ Quick Interest Check",
        body: [
          "❓ How long have you owned the place?",
          "→ Tenure tells you how attached they are and potential equity",
          "❓ Do you have a plan for where you'd go next?",
          "→ Uncovers timeline and flexibility",
          "🎤 The reason I ask — we're super flexible on timing. We can even let sellers stay after closing if that takes the stress off the move.",
        ],
      },
      {
        heading: "4️⃣ Property Condition & Details (confirm, don't interrogate)",
        body: [
          "🎤 So I'm actually pulling your property up right now — I'm showing a [#] bed / [#] bath, about [###] sq ft on a [###] sq ft lot, built in [year]. Just confirming I've got the right place — does that all line up?",
          "🎤 And since it was built in [year], I'd assume the big-ticket items — roof, HVAC, water heater — are probably original or getting up there. Have any of those been updated, or are we mostly looking at original systems?",
          "→ Beds, baths, sq ft, lot size and year are already on your comping software — CONFIRM them, don't ask. It signals you did your homework and we're not fishing. The only thing you're really learning here is the condition of the Major Six systems (roof, HVAC, water heater, foundation, electrical, sewage).",
          "🎤 Anything else major going on that I wouldn't see on paper?",
        ],
      },
      {
        heading: "5️⃣ Motivation & Timeline",
        body: [
          "❓ If you did sell, what would that next chapter look like for you?",
          "❓ Is there a timeframe that matters — soon, or more like someday?",
          "❓ What would need to happen for this to feel like the right move?",
        ],
      },
      {
        heading: "6️⃣ Soft Close",
        body: [
          "🎤 Would it make sense for me to take a deeper look at your property and come back with a couple of options? Just information — nothing pushy.",
          "— OR —",
          "🎤 Would you rather I reach back out if things change down the road? Keep our number handy — (877) 652-8991 — so you can reach us if something comes up.",
        ],
      },
    ],
    objections: [
      {
        objection: "\"I'm not interested in selling.\"",
        response: "Totally get that — I'm not trying to talk you into anything. I just wanted to reach out because your property came up and it seemed like it might be a fit for one of our buyers. If it ever makes sense down the road, we'd love to be the first call you make. Mind if I check back in a few months? You can also reach us anytime at (877) 652-8991.",
      },
      {
        objection: "\"I already have a real estate agent.\"",
        response: "No problem at all — I actually work alongside agents sometimes. The difference with us is we're buying directly, off-market. No listing period, no showings, no open houses. If you ever want to explore a private option alongside what your agent is doing, we can do that without conflicting. Just something to keep in your back pocket. Here's our number if you want to check us out — (877) 652-8991.",
      },
      {
        objection: "\"How do I know you're legit?\"",
        response: "That's a totally fair question. We're Freedom Offers — a veteran-owned acquisitions company out of San Diego. You can look us up right now at freedom-offers.com or call us at (877) 652-8991. We work directly with developers and buyers — this isn't our first deal. We take our reputation seriously, especially coming from a military background. Everything's in writing, everything goes through title.",
      },
    ],
  },
  {
    key: "luxury-seller",
    name: "Luxury Market Sellers",
    group: "Seller Scripts",
    icon: "👑",
    summary: "For high-value properties with development potential, where sellers have more equity and longer timelines.",
    steps: [
      {
        heading: "1️⃣ Cold Opener — Build Credibility",
        body: [
          "🎤 Hey, [Name]? This is [Your Name] calling from Freedom Offers. We're a veteran-owned acquisition company based out of San Diego — we work directly with developers and buyers looking for off-market properties in your area. So here's the deal — we specialize in higher-end homes, completely private, no public listings, no open houses. And I'm not gonna waste your time with lowball offers, I promise. You got a quick minute?",
          "💡 If they ask \"what company?\" → Say: \"Freedom Offers — you can check us out at freedom-offers.com. We work with developers to find off-market properties before they ever hit the market. You can also call us at (877) 652-8991 if you want to verify.\"",
        ],
      },
      {
        heading: "1️⃣ Warm Opener — Follow-Up from Previous Contact",
        body: [
          "🎤 Hey, [Name]? This is [Your Name] with Freedom Offers. So my team talked to you previously about [address] and mentioned you might possibly be looking to sell. Do you have about 5 mins?",
          "💡 Use this when your team has already made contact. Transitions straight to property specifics.",
        ],
      },
      {
        heading: "2️⃣ Why You're Calling",
        body: [
          "🎤 So the reason I'm reaching out — we've got a group of developers and buyers right now actively looking for properties in your area. Yours came up as a potential fit. I'm not here to pressure you into anything — I just wanted to see if a private, off-market option is something you'd ever consider.",
        ],
      },
      {
        heading: "3️⃣ Lot & Development Details (confirm, don't interrogate)",
        body: [
          "🎤 I'm pulling the lot up now — I'm showing roughly [###] sq ft, zoned [zoning], and it looks pretty [rectangular / irregular]. Confirming I've got that right?",
          "🎤 From the parcel map it looks like there [are / aren't] any easements — utilities or drainage — running through it. Is that accurate?",
          "🎤 And it looks like the property's on [sewer / septic]. Does that match?",
          "→ Lot size, zoning, shape, easements and utilities are all visible in your comping / parcel software — LEAD by confirming them so it's clear you've done your homework, not fishing. Only go open-ended where the data genuinely isn't available.",
          "❓ One thing I can't see on my end — did you ever run into any setback issues when you tried to improve the property?",
        ],
      },
      {
        heading: "4️⃣ Motivation & Timeline",
        body: [
          "❓ If you did sell, what would that next chapter look like for you?",
          "❓ Is there a timeframe that matters — soon, or more like someday?",
          "❓ What would need to happen for this to feel like the right move?",
        ],
      },
      {
        heading: "5️⃣ What Makes Freedom Offers Different (pause between each — let them react)",
        body: [
          "🎤 Here's what's different about us. We typically pay at retail value, so you get what you'd get on the open market, but without dealing with agents, inspections, or appraisals. And we cover all the closing costs.",
          "🎤 So you actually come out ahead, because you're saving the 6% in commissions alone. How does that sound so far?",
          "🎤 Everything also stays completely private. No public listings, no neighbors knowing your business, no open houses. You stay in control the whole time.",
          "🎤 And if you need a little time in the home after closing, we can usually work with that too. Would that help you out?",
          "🎤 You can also check us out at freedom-offers.com to see the work we do and the developers we partner with. We're a veteran-owned company, not a fly-by-night operation. Anytime, you can reach us at (877) 652-8991 or info@freedom-offers.com.",
        ],
      },
      {
        heading: "6️⃣ Soft Close — if they're motivated",
        body: [
          "🎤 Would it make sense for me to take a deeper look at your property and come back with a couple of options? Just information — nothing pushy.",
          "→ Use this when there's real motivation or urgency — they want to move. Go for the next step (a deeper look + options).",
        ],
      },
      {
        heading: "6️⃣ Soft Close — if not urgent or has roadblocks",
        body: [
          "🎤 Would you rather I reach back out if things change down the road? Keep our number handy — (877) 652-8991 — so you can reach us if something comes up.",
          "→ Use this when they're not in a rush to sell or hit you with roadblocks (taxes, tenants, timing, family). Don't push — plant the seed, stay top-of-mind, and follow up later.",
        ],
      },
    ],
    objections: [],
  },
  {
    key: "fix-flip-investor-buyer",
    name: "Fix & Flip Investors",
    group: "Buyer Scripts",
    icon: "🔨",
    summary: "For investors buying at 70% of ARV who want properties needing work in any market or price point.",
    steps: [
      {
        heading: "1️⃣ Opening",
        body: [
          "🎤 Hey [Investor Name], this is [Your Name] with Freedom Offers. We source off-market flip deals and I've got a property that might fit your criteria. You actively looking for deals right now?",
          "💡 Direct and fast. Flippers are busy — respect their time.",
        ],
      },
      {
        heading: "2️⃣ Qualify Their Buy Box",
        body: [
          "❓ What's your target purchase price range?",
          "❓ What neighborhoods or markets are you focused on?",
          "❓ Are you looking for cosmetic flips or full rehabs?",
          "❓ How fast can you close on the right deal?",
          "→ Make sure they fit BEFORE you send details. Don't waste time on bad matches.",
        ],
      },
      {
        heading: "3️⃣ Present the Deal",
        body: [
          "🎤 Okay, so here's what we have — [ADDRESS]. [YEAR BUILT], [SQUARE FOOTAGE]. The condition is [GENERAL: needs full rehab, cosmetic updates, etc.]. Based on the ARV in that area, this should work at the right price point.",
          "→ Don't give your purchase price. Let them analyze and make an offer.",
        ],
      },
      {
        heading: "4️⃣ Close",
        body: [
          "🎤 Want me to send you the full details? Or do you want to jump on a call and walk through it?",
        ],
      },
    ],
    objections: [],
  },
  {
    key: "developer-buyer",
    name: "Developers",
    group: "Buyer Scripts",
    icon: "👑",
    summary: "For developers buying at retail or above for land value and redevelopment — tear-down opportunities in luxury neighborhoods.",
    steps: [
      {
        heading: "1️⃣ Opening",
        body: [
          "🎤 Hey [Developer Name], this is [Your Name] with Freedom Offers. I source off-market development opportunities and I've got a land play in [NEIGHBORHOOD/AREA] that might match your buy box. You actively looking for projects?",
          "💡 Be direct. Reference their work if you know it. Sound like a peer.",
        ],
      },
      {
        heading: "2️⃣ Understand Their Buy Box",
        body: [
          "🎤 Perfect. Before I bring you details, I want to make sure it's actually a fit. What are you typically looking for right now?",
          "❓ What areas or neighborhoods are you focused on?",
          "❓ Price range per deal?",
          "❓ You more interested in tear-downs or renovation opportunities?",
          "❓ What's your timeline to move on projects?",
        ],
      },
      {
        heading: "3️⃣ Present the Opportunity",
        body: [
          "🎤 Okay, so here's the opportunity — [ADDRESS]. It's a [YEAR BUILT], on roughly [LOT SIZE]. The neighborhood has recent sales at [PRICE RANGE], solid comps for redevelopment. It's a strong development play.",
          "→ Focus on lot value, neighborhood strength, and redevelopment upside — not cosmetics.",
        ],
      },
      {
        heading: "4️⃣ Close",
        body: [
          "🎤 Want me to send you the full details? Or I can set up a time for you to walk the property?",
        ],
      },
    ],
    objections: [],
  },
  {
    key: "agent-disposition-luxury",
    name: "Agent Deal Disposition — Luxury (Developers)",
    group: "Agent Scripts",
    icon: "👑",
    summary: "When you have a luxury deal under contract and need an agent to connect you with developers/builders.",
    steps: [
      {
        heading: "1️⃣ Cold Opener",
        body: [
          "🎤 Hey [Agent Name], this is [Your Name] with Freedom Offers. We're a development acquisition company based in San Diego — we partner with developers and builders on luxury off-market properties. The reason I'm calling is we just acquired a deal in [AREA/ZIP] and it's a solid development opportunity. Do you have a few developers or builders you actively work with who might be looking for a project like this?",
        ],
      },
      {
        heading: "2️⃣ Get Their Developer List",
        body: [
          "❓ Who are the main developers or builders you work with in [ZIP/AREA]?",
          "❓ What kind of projects do they focus on? Price points? Lot size?",
        ],
      },
      {
        heading: "3️⃣ Share the Opportunity (Address + Condition Only)",
        body: [
          "🎤 Okay, so here's what we have — [ADDRESS]. It's a [YEAR BUILT] home, [SQUARE FOOTAGE], on roughly [LOT SIZE]. The condition is [GENERAL CONDITION: livable, needs renovation, tear-down opportunity]. It's a solid development play in that neighborhood.",
          "⚠️ DO NOT SHARE: Asking price, your analysis, ARV, your offer, or financing terms. If they ask price → Say: \"We're protecting the deal specifics for now, but if your developer is interested in the neighborhood and property type, I'm happy to explore it with them directly.\"",
        ],
      },
      {
        heading: "4️⃣ Understand Their Developer's Buy Box",
        body: [
          "🎤 Before I bring you more details, what are your developers typically looking for in [AREA]? Price range? Lot size? Any specific preferences?",
          "❓ Are they more interested in tear-downs or renovation opportunities?",
          "❓ What's their typical acquisition price per square foot?",
        ],
      },
      {
        heading: "5️⃣ Commission Incentive",
        body: [
          "🎤 Here's the cool part — if one of your developers is interested and we work together on this, I'm paying commission. You'd earn your commission when we close with their buyer. So you're incentivized to connect us with someone who can actually move on it.",
        ],
      },
      {
        heading: "6️⃣ Soft Close",
        body: [
          "🎤 So if you have a developer who's actively looking for deals in [AREA] and fits that profile, can you send me their contact info? Or I can reach out to them directly if you give me the intro. Either way works. And if this ends up being a fit, we'll make sure you're taken care of on commission. Sound good?",
        ],
      },
    ],
    objections: [],
  },
  {
    key: "agent-disposition-fix-flip",
    name: "Agent Deal Disposition — Fix & Flip (Investors)",
    group: "Agent Scripts",
    icon: "🔨",
    summary: "When you have a flip deal secured and need an agent to connect you with fix & flip investors.",
    steps: [
      {
        heading: "1️⃣ Cold Opener",
        body: [
          "🎤 Hey [Agent Name], this is [Your Name] with Freedom Offers. We're an acquisitions company focused on off-market deals and flips. I'm calling because we just secured a property in [AREA] that looks like a solid flip opportunity. Do you have buyers or investors you actively work with who flip properties in that market?",
        ],
      },
      {
        heading: "2️⃣ Get Their Flip Buyer Profile",
        body: [
          "❓ Do you work with fix & flip investors? How active are they right now?",
          "❓ What kind of properties are they looking for — price range, condition, neighborhoods?",
          "❓ Are they cash buyers or using financing?",
        ],
      },
      {
        heading: "3️⃣ Share the Property (Address + Condition Only)",
        body: [
          "🎤 Okay, so here's the deal — [ADDRESS]. It's a [YEAR BUILT] home, [SQUARE FOOTAGE], on [LOT SIZE]. The condition is [GENERAL CONDITION: needs full rehab, cosmetic updates needed, good bones]. It's a solid flip candidate in that neighborhood.",
          "⚠️ DO NOT SHARE: Purchase price, ARV, your analysis. If they ask price → Say: \"We're protecting the numbers for now, but if your buyers are interested in this neighborhood and property type, I can get you more details.\"",
        ],
      },
      {
        heading: "4️⃣ Understand the Flip Buyer's Buy Box",
        body: [
          "🎤 Before I send you full details, what are your buyers typically looking to spend? And what kind of condition are they comfortable with?",
          "❓ Are they looking for cosmetic flips or full rehabs?",
          "❓ What neighborhoods are hot for them right now?",
        ],
      },
      {
        heading: "5️⃣ Commission Incentive",
        body: [
          "🎤 Here's the deal — if one of your flip investors is interested and we connect, you'll earn commission when we close. So there's real money in introducing me to the right buyer.",
        ],
      },
      {
        heading: "6️⃣ Soft Close",
        body: [
          "🎤 So if you have investors looking for deals in [AREA], can you send me their info or make an intro? And if it closes, commission is yours.",
        ],
      },
    ],
    objections: [],
  },
  {
    key: "agent-sourcing-luxury",
    name: "Agent Pocket Listing Sourcing — Luxury Tear-Down",
    group: "Agent Scripts",
    icon: "👑",
    summary: "After sending an agent a deal, ask them to source older pre-1980s homes on valuable lots in luxury neighborhoods.",
    steps: [
      {
        heading: "Criteria",
        body: [
          "Old properties (pre-1980s) in luxury neighborhoods where recent comps sold $2M+ within last 5 years. Same neighborhood as the deal you just sent.",
        ],
      },
      {
        heading: "1️⃣ Opening After Sending Deal",
        body: [
          "🎤 Hey [Agent Name], so I sent you that deal at [ADDRESS] earlier. That neighborhood is exactly what we're focused on right now. Do you have any other pocket listings in that same neighborhood? Old homes, pre-1980s especially, where the seller might be thinking about selling but hasn't listed yet?",
        ],
      },
      {
        heading: "2️⃣ Clarify the Opportunity",
        body: [
          "🎤 Here's what we're looking for — older properties in that neighborhood. The sellers might not be ready to list, but they're thinking about it. Could be an estate, empty nesters wanting out, anything like that. The land value is what matters — we're looking at these as redevelopment opportunities.",
          "❓ Do you know of any sellers in that neighborhood who fit that profile? Properties that are older but on valuable lots?",
          "❓ Any homes that have been sitting, or owners who've mentioned wanting to sell but haven't listed?",
        ],
      },
      {
        heading: "3️⃣ Why You're Interested",
        body: [
          "🎤 The reason we're hunting in this neighborhood is we have developers looking for exactly this — old homes on great lots where they can build something new. The neighborhood's appreciating, we're seeing recent sales at $2M+, and developers see the land value. So if you know of any owners who might consider selling, we can move really fast on it.",
        ],
      },
      {
        heading: "4️⃣ Commission & Incentive",
        body: [
          "🎤 And here's the good part — if you know of a property and can connect us with the seller, we'll pay your full commission when we close. We cover all closing costs too. So there's real money in this if you can point us toward the right sellers.",
        ],
      },
      {
        heading: "5️⃣ Soft Close",
        body: [
          "🎤 So can you think of anyone in that neighborhood who might fit? Even if you're not sure if they want to sell, if you know someone with an older home on a valuable lot, send me their name and I'll explore it. If it works out, you get the commission. Sound good?",
          "🎤 You can reach me at (877) 652-8991 or info@freedom-offers.com. I'll check in in a couple weeks too.",
        ],
      },
    ],
    objections: [],
  },
  {
    key: "agent-sourcing-fix-flip",
    name: "Agent Pocket Listing Sourcing — Fix & Flip",
    group: "Agent Scripts",
    icon: "🔨",
    summary: "After sending an agent a deal, ask them to source distressed properties and motivated sellers in any neighborhood.",
    steps: [
      {
        heading: "Criteria",
        body: [
          "Any price point, any neighborhood. Distressed properties, motivated sellers, estates, properties needing renovation. Not location-specific like luxury — condition and motivation matter.",
        ],
      },
      {
        heading: "1️⃣ Opening After Sending Deal",
        body: [
          "🎤 Hey [Agent Name], so I sent you that flip opportunity at [ADDRESS]. We're constantly looking for more distressed properties just like that. Do you know of any other off-market deals in your area? Homes that need work, sellers in a pinch, anything like that?",
        ],
      },
      {
        heading: "2️⃣ Clarify What You Buy",
        body: [
          "🎤 Here's what we're looking for — properties where sellers are motivated to move. Could be an estate, inherited property, landlords who are done, foreclosure, anything where they need to sell fast. The property can need work — that's perfect. We buy as-is, all cash, and we close quick.",
          "❓ Do you know of any properties like that? Estate sales, distressed sellers, anything where they might not want to list publicly?",
          "❓ Any properties that have been on the market and didn't sell, or homes where the owners have mentioned they want out?",
        ],
      },
      {
        heading: "3️⃣ Your Buyer Profile",
        body: [
          "🎤 The reason this matters — we have flip investors looking for exactly this. They want renovation projects, they need deals at wholesale prices, and they want to close fast. So if you know of distressed properties or motivated sellers, we can connect them immediately.",
        ],
      },
      {
        heading: "4️⃣ Your Terms",
        body: [
          "🎤 Here's what we offer — we cover all closing costs. The seller keeps more cash. And we still pay your full commission when it closes. So there's no downside for the agent, and the seller gets a fast, clean exit.",
        ],
      },
      {
        heading: "5️⃣ Soft Close",
        body: [
          "🎤 So if you know of any distressed properties or motivated sellers in your area, send them my way. I'll handle all the outreach and if we buy it, you get commission. No pressure — just keep us in mind. You can reach me at (877) 652-8991 or info@freedom-offers.com. I'll follow up in a couple weeks too.",
        ],
      },
    ],
    objections: [],
  },
];
