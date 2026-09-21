// Built-in rotating training-tip library for the Monday deck (Jon 2026-09-21:
// "the training tip has always been the same — create more randomized training
// for acquisitions and dispositions"). One acquisitions + one dispositions tip
// shows each week, rotating through these pools seeded by the week — with ~2
// dozen per side the cycle runs about half a year before repeating. Tips added
// in the /meeting backlog join the rotation (tagged to a KPI → that role's pool).
// Content distilled from our land course pack + valuation training.

export const ACQ_TIPS: string[] = [
  "Name the value they're quoting. 'Zillow says more' means market value — months of exposure, no rush. Our cash number is a speed price. Say the trade out loud and let the seller pick.",
  "Zoning is step 1, not step 5. Before you fall in love with a parcel, confirm what it's legally allowed to become — the best allowed use sets the price, not the weeds on it.",
  "Check when the parcel last sold before anchoring to assessed value. Long-held land carries a decades-stale tax number — ⅓ of a 1995 assessment is an insult, not an offer.",
  "Ask 'what were you hoping to walk away with?' before quoting anything. Half the time their number is inside our buy range and you just saved yourself a negotiation.",
  "Silence after the offer. Say the number, then stop talking. The first person to speak fills the gap with a concession — make sure it isn't you.",
  "Motivated land sellers sound bored, not desperate. They inherited it, they pay taxes on it, they never visit it. 'Tired of paying taxes on it?' opens more doors than 'need to sell fast?'",
  "Two-touch minimum on every dead lead every 90 days. Land sellers move slow — the yes usually comes on contact four to seven, when the tax bill lands.",
  "Walk the offer math with the seller. 'Here's what builders pay, here's what it costs to get there, here's why my number is my number.' Transparent math closes more than a bigger number.",
  "Access is the deal. No recorded legal access = near-worthless until fixed. Confirm road frontage or a deeded easement before you spend another minute on it.",
  "Anchor with a range, close with a number. 'Land like yours trades between X and Y depending on access and zoning' keeps them talking; the exact offer comes after they're invested.",
  "An old house on the lot is still a land deal. Sale price minus the tired structure = dirt value. Teardown streets hand you a land comp with every house that sells.",
  "Ask about the neighbors. The adjoining owner is often the highest-value buyer (use value beats market value) — and the seller usually knows if they've ever wanted it.",
  "Novation objection-killer: 'To get the top number, the market has to see it — that takes 3 to 6 months. Cash is for when weeks matter.' No apology, just physics.",
  "Pull the plat before the call. Shape, slope, flood zone, and easements through the middle change your number — knowing them first makes you the expert on their own land.",
  "When they say 'a developer offered my neighbor more' — developers pay investment value off their own spreadsheet. Two parcels a street apart pencil completely differently. Offer to run their parcel through the same math.",
  "Every no gets a reason logged. 'Price', 'not ready', 'family' — the reason decides the follow-up cadence, and follow-up is where land money actually lives.",
  "Quote net, not gross. 'You walk away with $X — no commissions, no closing costs, no survey bill' beats a bigger number that shrinks at the closing table.",
  "Verify the decision-maker on call one. Land is the #1 asset stuck in estates — if it's heirs, get every name early or watch the deal die in title.",
  "Taxes owed are leverage, not a problem. Back taxes come off the seller's net either way — the seller who owes three years is closer to yes than the one who owes zero.",
  "Set the next touch before hanging up. 'I'll call you Thursday after I talk to my land specialist' — a scheduled callback triples the answer rate of a cold re-dial.",
  "Price the delay into probate and title messes. Missing heirs and unreleased deeds are fixable — but slow. Your offer can be fair AND account for six months of cleanup.",
  "Sell certainty, not just price. Proof of funds, a real EMD, a title company they can call — the seller who's been burned by a flaky buyer takes less from someone who'll actually close.",
  "One extra question before the offer: 'Is there anything about the property I should know — easements, disputes, wetlands?' Sellers disclose more before a number is on the table.",
  "Record your best call each week and clip 60 seconds for the team. The fastest training in the building is hearing a real seller say yes.",
];

// Weekly team-building activity — closes the Monday all-call (Jon 2026-09-21:
// "a team building activity, 2–3 minutes, 5 max, new every single week, at the
// very end"). All video-call friendly, zero prep, works across PH + US. Rotates
// weekly on its own seed, so the cycle runs ~7 months before repeating.
export type TeamActivity = { title: string; how: string; minutes: number };
export const TEAM_ACTIVITIES: TeamActivity[] = [
  { title: "One-Word Whip-Around", how: "Everyone sums up their week ahead in exactly ONE word — no explanations allowed. Fastest lap wins bragging rights.", minutes: 2 },
  { title: "Two Truths & a Lie", how: "One volunteer gives two truths and one lie about themselves. Everyone votes in chat, then the reveal. New volunteer next time it comes up.", minutes: 3 },
  { title: "Emoji Weekend", how: "Everyone drops exactly 3 emojis in the chat describing their weekend. The team guesses the story behind the most mysterious one.", minutes: 3 },
  { title: "Desk Show & Tell", how: "Grab the nearest object on your desk that says something about you. 15 seconds each to show it and explain.", minutes: 4 },
  { title: "This or That — Speed Round", how: "Host fires 10 quick either/ors (beach or mountains, coffee or tea, call or text…). Everyone answers with a 1 or 2 in chat as fast as they can.", minutes: 2 },
  { title: "Best Thing You Ate", how: "Quick lap: the best thing you ate this week and where. Bonus points for making the team hungry.", minutes: 3 },
  { title: "Hometown Flex", how: "One thing your hometown or province does better than anywhere else on earth. 20 seconds each, no modesty allowed.", minutes: 4 },
  { title: "45-Second Speed Draw", how: "Everyone draws a vacant lot with ONE dream feature on it — 45 seconds, then hold it up to the camera. Vote the winner in chat.", minutes: 3 },
  { title: "Rose · Thorn · Bud", how: "Lightning lap: one win from last week (rose), one headache (thorn), one thing you're excited about (bud). 20 seconds each.", minutes: 4 },
  { title: "Guess Whose Photo", how: "Before the call, two people DM the host a photo from their camera roll (pet, food, view). Host shares screen; team guesses whose is whose.", minutes: 3 },
  { title: "The 10-Second Pitch", how: "Random object chosen by the host (stapler, plant, mug). Two volunteers each get 10 seconds to sell it to the team like it's a $1M listing.", minutes: 3 },
  { title: "First Job Stories", how: "Quick lap: your very first job ever, and the weirdest thing about it. 20 seconds each.", minutes: 4 },
  { title: "Would You Rather — Business Edition", how: "Host asks 3: e.g. 'close 10 small deals or 1 whale?', 'cold call for a day or door knock for an hour?'. Vote in chat, loudest disagreement explains.", minutes: 3 },
  { title: "Camera Roll Roulette", how: "Everyone shares (or describes) the most recent SAFE photo on their phone. The stories are always better than expected.", minutes: 4 },
  { title: "Team Trivia — One Question", how: "Host asks ONE trivia question about the company (first deal? oldest tool we use? team birthdays?). First right answer in chat gets the glory.", minutes: 2 },
  { title: "Dream Parcel", how: "If you could own 5 acres anywhere on earth, where and why? 15 seconds each around the horn.", minutes: 4 },
  { title: "The Compliment Chain", how: "Host starts by giving a specific compliment to one teammate about last week. That person compliments the next, until everyone's been hit.", minutes: 4 },
  { title: "Phone Wallpaper Reveal", how: "Everyone shows or describes their phone wallpaper and the story behind it. Skip-friendly, but nobody ever skips.", minutes: 3 },
  { title: "Superpower Draft", how: "Pick one work superpower: read seller minds, instant comps, never hit voicemail, 25th hour every day. Defend your pick in one sentence.", minutes: 3 },
  { title: "Accent / Language Lesson", how: "One teammate teaches the team a phrase in their language or local slang (Tagalog week? San Diego slang week?). Everyone repeats it back on mic.", minutes: 3 },
  { title: "Rapid Fire Favorites", how: "Host names a category (karaoke song, snack, movie villain, road-trip food). Everyone answers in chat at once; host reads the best out loud.", minutes: 2 },
  { title: "Two-Minute Stretch Olympics", how: "Cameras on: one person leads 4 desk stretches for the team. Most dramatic stretcher gets named.", minutes: 2 },
  { title: "The Prediction Game", how: "Everyone predicts ONE specific thing that will happen this week (a deal, a funny seller call, the weather). Written in chat — reviewed next Monday.", minutes: 3 },
  { title: "Bucket List Lap", how: "One thing on your bucket list you haven't told the team about. 15 seconds each.", minutes: 4 },
  { title: "Worst Advice Ever", how: "Quick lap: the worst advice anyone ever gave you (money, career, or life). Bonus if you followed it.", minutes: 4 },
  { title: "GIF Battle", how: "Host names a theme ('Monday energy', 'closing a deal', 'seller ghosted me'). Everyone posts one GIF in the chat; team votes the winner.", minutes: 3 },
  { title: "The Time Machine", how: "You get 30 seconds with yourself on your first day at this company. What do you say? Two or three volunteers share.", minutes: 3 },
  { title: "Sound Check Karaoke", how: "One brave volunteer hums or sings 5 seconds of a song; first correct guess in chat picks next week's brave volunteer.", minutes: 2 },
  { title: "What's In Frame", how: "Everyone tilts their camera to show ONE thing in their room the team has never seen, with a one-line story.", minutes: 4 },
  { title: "Gratitude Lightning Round", how: "One specific thing a TEAMMATE did recently that made your job easier — name them. 15 seconds each, no generic answers.", minutes: 3 },
];

export const DISPO_TIPS: string[] = [
  "Sell the build, not the dirt. Builders buy lots that pencil — lead with 'new construction next door sells for $X' and let the lot's share of that number do the talking.",
  "Know the buyer's buy-box before the deal exists. Five deep-vetted builders who tell you exactly what they buy beat 500 names on a list.",
  "A developer's price comes from their residual: finished value minus build costs, profit, and time. Don't argue comps with a spreadsheet — find the buyer whose spreadsheet fits.",
  "First 48 hours decide the deal. Blast the vetted list day one, follow up voice-to-voice day two — land that sits a week smells like land that's overpriced.",
  "Ask every buyer who passes: 'What number WOULD work?' A pass with a price is a comp for the next deal — and a reopened door when the seller drops.",
  "Your buyer call isn't a pitch, it's an interview. Where are you building, what did you pay for your last three lots, what kills a deal for you? Capture it in the buy-box.",
  "Photos sell land. Drone shot, corner pins, road frontage, the neighbor's new build in frame — a listing with 8 good photos outperforms a paragraph of acreage math.",
  "Segment the blast: infill lots to builders, acreage to rec buyers and neighbors, paper to note buyers. One list for everything trains buyers to ignore you.",
  "Call the neighbors on every rural parcel. The adjoining owner pays use value — often the highest number on the board — and nobody else is calling them.",
  "Price drops are scheduled, not emotional. Day 10, day 21, day 30 — decide the reduction ladder the day you list, then execute it without a meeting.",
  "Every buyer conversation ends with a next step: 'I'll send the plat today — if it pencils, can you walk it this week?' Momentum is the product.",
  "Build the second-place list. Every underbidder from the last deal is the first call on the next one — they've already told you they're hungry.",
  "Know title status cold before buyer calls. 'Clean prelim, access recorded, survey in hand' answers the three questions that stall every land closing.",
  "When a deal stalls, change the buyer type before the price. A lot that no builder wants at $80k might be a neighbor's dream at $85k or an owner-finance note at $95k.",
  "Log every buyer offer — even the insulting ones. Offers received is a KPI because a board full of real numbers tells us where the market actually is.",
  "Answer speed is a superpower. A buyer who texts about a lot is buying THIS week — a 5-minute reply closes what a 5-hour reply loses.",
  "Owner-finance is a price, not a surrender. Full ask with 20% down at 9% often nets more than a cash discount — know the note math before you need it.",
  "Walk buyers through the kill-risks up front: easement here, flood fringe there. Surprises kill closings; disclosed flaws just reprice them.",
  "Track days-on-market per parcel type. When infill moves in 9 days and rec land takes 40, your pricing and follow-up cadence should say so.",
  "Ask closed buyers for the next buyer. 'Who else is building in this ZIP?' — a referral from a builder who just closed is a pre-vetted whale.",
  "Re-blast with a story, not a lower number. 'Survey came back — half an acre bigger than taxed' revives a stale listing better than '$5k off'.",
  "Match energy to timeline: a builder buying 30 lots a year is a relationship; a rec buyer wants THE parcel. Sell the pipeline to one, the dream to the other.",
  "Keep a 'passed but close' shelf. When the seller finally drops $10k, the three buyers who passed at the old number get the first call — same day.",
  "Voice beats email for the first touch on any deal over $50k. Builders skim inboxes; they answer 'I've got a lot two streets from your last build.'",
];
