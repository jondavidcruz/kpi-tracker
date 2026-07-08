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
          "🎤 Hey, [Name]? This is [Your Name] calling from Freedom Offers. We're a veteran-owned acquisitions company based out of San Diego. We buy properties directly, as-is, so there's no agents, no listings, and no open houses. And I'm not gonna waste your time with a lowball, I promise. You got a quick minute?",
          "💡 If they ask \"what company?\" → Say: \"Freedom Offers. You can check us out at freedom-offers.com or call (877) 652-8991 to verify. We buy off-market properties directly from owners.\"",
        ],
      },
      {
        heading: "1️⃣ Warm Opener — Follow-Up from Previous Contact",
        body: [
          "🎤 Hey, [Name]? This is [Your Name] with Freedom Offers. So my team talked to you previously about [address] and mentioned you might possibly be looking to sell. Do you have about 5 mins?",
          "💡 Use this when your team has already made contact or they've engaged with you before. Skips the credibility setup, they know who you are. Go straight to property.",
        ],
      },
      {
        heading: "2️⃣ 🤝 BUILD RAPPORT FIRST — before ANY talk about the house (do not skip)",
        body: [
          "⚠️ STOP. Do not go to the property yet. People sell to people they like and trust. Win the first 2–3 minutes on THEM, not the house — this is where the deal is actually made or lost. Jumping straight to condition feels like a survey and kills the offer.",
          "🎤 Slow down and match their energy — relaxed if they're relaxed, quick but warm if they're busy. Smile; they can hear it.",
          "❓ So how long have you been in the home? … Oh nice — how'd you end up in that area? / Raise the family there? (then be quiet and let them talk)",
          "🎤 Find ONE real thing to connect on — the neighborhood, their years there, something they mention — and react like a human, not a robot: \"That's awesome.\" \"Man, I hear you.\" \"That must've been a lot to manage.\"",
          "💡 THE RULE: they should be talking MORE than you here. Ask one question, then shut up and listen. Don't rush to the next line.",
          "🎤 Only move on once it feels like two people having a real conversation. If it still feels stiff or transactional, stay here longer — ask one more thing about them.",
          "✅ You've earned rapport when: they've shared something personal, you reacted genuinely, and the tone is a chat — not an interrogation. THEN, and only then, go to condition.",
        ],
      },
      {
        heading: "3️⃣ Why You're Calling",
        body: [
          "🎤 So the reason I'm reaching out, we look at properties in your area and run the numbers to see what we could pay. Yours came up as one we'd be interested in. I'm not here to pressure you into anything, I just wanted to see if a private, as-is sale is something you'd ever consider.",
        ],
      },
      {
        heading: "4️⃣ Their Situation (keep the rapport going)",
        body: [
          "❓ How long have you owned the place?",
          "→ Tenure tells you how attached they are and potential equity",
          "❓ Do you have a plan for where you'd go next?",
          "→ Uncovers timeline and flexibility — and keeps it about THEM, not the walls",
          "🎤 The reason I ask — we're super flexible on timing. We can even let sellers stay after closing if that takes the stress off the move.",
          "→ 🤝 Still listening more than talking. Every answer is a chance to connect before you get technical.",
        ],
      },
      {
        heading: "5️⃣ Property Condition & Details (for underwriting — ONLY after rapport)",
        body: [
          "⚠️ Gut check first: did you actually build rapport and hear their story? If you jumped straight here, back up — this step lands completely differently once they like you.",
          "🎤 So I'm actually pulling your property up right now. I'm showing a [#] bed / [#] bath, about [###] sq ft on a [###] sq ft lot, built in [year]. Just confirming I've got the right place. Does that all line up?",
          "→ Beds, baths, sq ft, lot size and year are already on your comping software, so CONFIRM them, don't ask. It signals you did your homework.",
          "🎤 Perfect. I just need a feel for the condition so I can run it past our underwriters and see what it qualifies for. Mind walking me through the big-ticket items real quick?",
          "❓ Roof, about how old is it, or when was it last replaced?",
          "❓ HVAC / furnace, what's the age on that?",
          "❓ Water heater, original or has it been swapped out?",
          "❓ Foundation, any known issues, cracks, or settling?",
          "❓ Windows, original single-pane or have they been updated?",
          "→ GET THE AGE / YEAR on each: roof, HVAC, water heater, foundation, windows. That's exactly what underwriting needs to price the offer, so jot the year next to each one.",
          "🎤 Anything else major going on that I wouldn't see on paper?",
        ],
      },
      {
        heading: "6️⃣ Motivation & Timeline",
        body: [
          "❓ If you did sell, what would that next chapter look like for you?",
          "❓ Is there a timeframe that matters — soon, or more like someday?",
          "❓ What would need to happen for this to feel like the right move?",
        ],
      },
      {
        heading: "7️⃣ Soft Close — run it by underwriting + get their email",
        body: [
          "🎤 Here's what I'd like to do. Let me take everything you gave me, run it past our underwriters, and come back to you with what the property would qualify for. No obligation at all, just real numbers.",
          "🎤 What's the best email to send that over to? I'll get you the numbers along with a quick breakdown.",
          "→ Always get the email. It lets you send the offer in writing AND follow up later. If they hesitate, frame it as \"just so I can send you the numbers in writing.\"",
          "→ 🤝 Rapport: thank them for their time and reference something they shared earlier (the move, the timeline). Leaving them feeling heard is what gets the callback.",
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
        heading: "2️⃣ 🤝 BUILD RAPPORT FIRST — before ANY talk about the lot (do not skip)",
        body: [
          "⚠️ STOP. Luxury/land sellers have equity and options — they will not deal with someone who feels transactional. Earn the first few minutes on THEM before a single question about the property.",
          "🎤 Slow down, match their tone. These are longer, higher-trust conversations — treat it like meeting a peer, not running a checklist.",
          "❓ How long have you owned the lot / property? … What drew you to that area originally?",
          "🎤 Connect on something real — the neighborhood, the view, how the area's changed, their plans. React like a person: \"That area's incredible.\" \"I don't blame you.\"",
          "💡 THE RULE: let them talk more than you. One question, then listen. Curiosity beats a pitch every time here.",
          "✅ Move on only when it feels like a genuine conversation. Then go to the lot details — you'll get far more (easements, other builders, their number) once they trust you.",
        ],
      },
      {
        heading: "3️⃣ Why You're Calling",
        body: [
          "🎤 So the reason I'm reaching out — we've got a group of developers and buyers right now actively looking for properties in your area. Yours came up as a potential fit. I'm not here to pressure you into anything — I just wanted to see if a private, off-market option is something you'd ever consider.",
        ],
      },
      {
        heading: "4️⃣ Lot & Development Details (confirm what you see — ONLY after rapport)",
        body: [
          "🎤 So I'm pulling the lot up right now. I'm showing roughly [###] sq ft, zoned [zoning], and it looks pretty [rectangular / irregular]. Just confirming I've got that right?",
          "→ Lead by CONFIRMING the data you can see (size, zoning, shape, utilities) so it's clear you did your homework. Save the open questions for what the software can't show.",
          "🎤 And it looks like the property's on [sewer / septic]. Does that match?",
          "❓ One thing I usually can't see clearly on my end: do you know if there are any easements or setback issues on the lot? Utilities, drainage, access, anything like that?",
          "❓ Have any other developers or builders reached out to you about this lot, or about building on it?",
          "→ 🤝 Rapport: if other builders have called, lean in warmly. 'Yeah, it's a great lot, I'm not surprised.' It validates them and positions you as the one who actually follows through.",
          "❓ And just so I know where you're at: do you have a number in mind, a price you'd be hoping to get if you did decide to sell?",
          "→ Ask their price FIRST so you can anchor off it. If they won't share a number, no problem, circle back once you've built more value.",
        ],
      },
      {
        heading: "5️⃣ Motivation & Timeline",
        body: [
          "→ 🤝 Rapport: this is the moment that matters most. Slow down, listen, and react to what they share. Their 'why' is where the deal and the trust live, so don't rush to the next question.",
          "❓ If you did sell, what would that next chapter look like for you?",
          "❓ Is there a timeframe that matters, soon or more like someday?",
          "❓ What would need to happen for this to feel like the right move?",
        ],
      },
      {
        heading: "6️⃣ What Makes Freedom Offers Different (pause between each — let them react)",
        body: [
          "🎤 Here's what's different about us. We typically pay at retail value, so you get what you'd get on the open market, but without dealing with agents, inspections, or appraisals. And we cover all the closing costs.",
          "🎤 So you actually come out ahead, because you're saving the 6% in commissions alone. How does that sound so far?",
          "🎤 Everything also stays completely private. No public listings, no neighbors knowing your business, no open houses. You stay in control the whole time.",
          "🎤 And if you need a little time in the home after closing, we can usually work with that too. Would that help you out?",
          "🎤 You can also check us out at freedom-offers.com to see the work we do and the developers we partner with. We're a veteran-owned company, not a fly-by-night operation. Anytime, you can reach us at (877) 652-8991 or info@freedom-offers.com.",
        ],
      },
      {
        heading: "7️⃣ Soft Close — if they're motivated",
        body: [
          "🎤 Would it make sense for me to take a deeper look at your property and come back with a couple of options? Just information — nothing pushy.",
          "→ Use this when there's real motivation or urgency — they want to move. Go for the next step (a deeper look + options).",
        ],
      },
      {
        heading: "7️⃣ Soft Close — if not urgent or has roadblocks",
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
    key: "linkedin-developer-outreach",
    name: "LinkedIn — Developer / Builder Outreach",
    group: "Buyer Scripts",
    icon: "💼",
    summary: "Find and warm up developers/builders on LinkedIn. Templates for connect → intro → deal. All sends are manual + Jon-approved — never automate.",
    steps: [
      {
        heading: "⚠️ Rules before you touch LinkedIn",
        body: [
          "⚠️ NEVER auto-send. No bots, no browser-extension blasters, no cloud automation tools. LinkedIn bans those and it kills Jon's real account + network permanently.",
          "⚠️ Get Jon's OK before any outreach goes out. Draft here, send after approval.",
          "⚠️ Stay human-paced: max ~15–20 connection requests/day, ~30–40 messages/day, from a real logged-in session. Personalize every one.",
          "💡 Use LinkedIn search / Sales Navigator to FIND builders — search by title ('Owner', 'Principal', 'Land Acquisition') + '<city> custom homes / development' + recent activity. Note the principal's name, add them to Buyer Research.",
        ],
      },
      {
        heading: "1️⃣ Connection request (no pitch — keep it under 300 chars)",
        body: [
          "🎤 Hi [First name] — I work with builders in [area] on off-market tear-down / value-add lots. Love what your team is doing in [neighborhood/project]. Would be glad to connect.",
          "→ Reference something real (a project, a neighborhood, a recent build). Generic = ignored or flagged spam.",
          "💡 If you have a live deal in their area, you can name-drop it lightly: '…have a lot in [area] that might be your profile.'",
        ],
      },
      {
        heading: "2️⃣ First message after they accept",
        body: [
          "🎤 Thanks for connecting, [First name]. Quick one — we source off-market lots and tear-downs in [areas]. What's your buy box right now? Target areas, max price per lot, and how fast you can close cash — so I only bring you stuff that actually fits.",
          "→ Goal of this message = get their buy box, not sell. Capture every answer in Buyer Research.",
          "❓ If no reply in 3–4 days, one soft follow-up:",
          "🎤 No worries if now's not the time — should I keep you posted when something in [area] comes up, or is there a better person on your team for acquisitions?",
        ],
      },
      {
        heading: "3️⃣ When you have a matching deal",
        body: [
          "🎤 [First name] — got one that fits your box: [address/area], [lot size / beds-baths], asking [price]. [One line on why it pencils for them]. Want the full details?",
          "→ 30 seconds, their criteria, one reason it fits. Then send details / set a call.",
          "💡 Log the touch in Buyer Research so it credits Developers Contacted and keeps the follow-up alive.",
        ],
      },
    ],
    objections: [
      { objection: "\"How'd you get my info?\"", response: "Straight answer: \"LinkedIn — I focus on builders active in [area] and your projects came up. Figured it was worth connecting directly.\"" },
      { objection: "\"I only work with agents I know.\"", response: "\"Totally fair. I'm not asking to replace anyone — just to be the person who brings you off-market lots before they hit the MLS. No cost to you to see them.\"" },
      { objection: "\"Send me everything you get.\"", response: "\"I'd rather only send what fits — saves us both time. Give me your target areas and max per lot and I'll filter to just those.\" (→ get the buy box)" },
    ],
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
