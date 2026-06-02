# KPI Tracker — Build Specification

**Owner:** Jon Cruz
**Date:** 2026-05-30
**Status:** Awaiting approval to build
**Source of truth replaced:** Google Sheet "Daily Scorecard" (real-estate acquisitions team)

---

## 1. Goal in one sentence

Replace the passive daily scorecard spreadsheet with a hosted web app that is **fast to enter**, **easy to read at a glance**, and **actively alerts** the right person (in-app, Google Chat, and email) the moment a KPI falls below goal or behind monthly pace — so problems get corrected the same day instead of discovered at month-end.

---

## 2. What the current spreadsheet is (from your live sheet)

- **Rows = "Measurables"**, each with a **GOAL**; **columns = every calendar day** (Jan 1 → Dec 31). One year = 365 columns. This is the readability/entry pain.
- **Per-rep activity blocks:** Michelle (Outbound Calls 200, Dialer Talk 1:00, CRM Talk 2:00, Process Call), Ethan (Talk Time), Sharyn (Buyers Contacted), Irish, plus generic rep blocks (Outbound, Convos, Talktime Dialer/CRM, Quality Convo).
- **Team funnel:** Connected Calls (150), On Call Time (1:00), Leads Generated (3), Leads CC (15), Appts Set (20), Appts Taken (100%), Offers Made, Contracts Sent (30), Contracts Signed (10), Buyers Qualified, Offers Received, Deals Closed.
- **Monthly financials:** Total Leads, Deals Closed, Gross Revenue, Marketing Spend, Operating Expenses.
- **Derived monthly ratios:** Revenue/Lead, Revenue/Deal, Cost/Lead, Cost/Deal, Net Margin, Marketing ROI, Company ROI.
- **A color legend you already defined** — this becomes the alert-severity engine:
  - 🟢 **GREEN** — Money KPIs (non-negotiable). Miss = miss revenue. → **hard alert**
  - 🔵 **BLUE** — Activity drivers / system KPIs that feed the green ones. → **soft alert (coaching)**
  - 🟡 **YELLOW** — Efficiency / visibility only. → **track, no alert**
  - 🔴 **RED** — Not success metrics. → **track silently, never alert/pressure**

---

## 3. Tech stack (recommended)

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + TypeScript + Tailwind CSS** | Fast, responsive, works on phone + desktop. Big, friendly inputs. |
| UI components | **shadcn/ui** | Clean, readable cards, tables, color states out of the box. |
| Database | **Supabase (Postgres)** | Hosted, free tier, row-level security per rep. |
| Auth | **Supabase magic-link email** | No passwords for reps — they click an email link to log in. |
| Hosting | **Vercel** | One-command deploy, free tier, built-in **cron** for scheduled alert checks. |
| Email alerts | **Resend** | Simple API, generous free tier. |
| Google Chat alerts | **Google Chat incoming webhook** | No OAuth needed — paste a webhook URL per channel. |
| In-app alerts | Built-in (alerts table + dashboard banners) | Real-time red/yellow/green flags. |

All services chosen have free tiers sufficient for a single team. Estimated running cost at this scale: **$0–$20/mo**.

> Alternative if you'd rather not run a separate database: same Next.js app with Supabase swapped for **SQLite/Turso**. Noted but not recommended for multi-rep concurrent entry.

---

## 4. Data model

```
users
  id, name, email, role ('rep' | 'manager' | 'admin'), active, timezone

kpis                       -- the catalog of measurables
  id, name, emoji, category ('green'|'blue'|'yellow'|'red'),
  unit ('count'|'duration'|'percent'|'currency'|'ratio'),
  scope ('per_rep'|'team'),
  cadence ('daily'|'monthly'),
  goal_value, goal_kind ('at_least'|'at_most'|'exact'|'tracked'),
  definition (text from your LEGEND tab),
  sort_order, active

targets                    -- optional per-rep / per-period overrides
  id, kpi_id, user_id (nullable=team), period ('YYYY-MM' or null=standing),
  goal_value

entries                    -- the actual numbers reps type in
  id, kpi_id, user_id (nullable for team KPIs), date, value, note,
  entered_by, entered_at
  UNIQUE(kpi_id, user_id, date)

alerts                     -- every flag raised
  id, kpi_id, user_id, date, severity ('hard'|'soft'),
  expected, actual, message, status ('open'|'ack'|'resolved'),
  channels_sent (jsonb), created_at

settings                   -- one row
  google_chat_webhook_url, alert_email_recipients,
  workday_cutoff_time, week_start, org_timezone
```

**Derived metrics** (Revenue/Lead, Cost/Deal, ROI, connection rate, dials-per-deal, etc.) are **computed on read**, never stored — so they can never drift out of sync the way the spreadsheet formulas do.

---

## 5. Alert engine (the part the spreadsheet can't do)

Two trigger types:

**A. On-entry (instant).** When a rep saves a value, evaluate that KPI immediately:
- `green` + below goal → **hard alert**
- `blue` + below goal → **soft alert**
- `yellow`/`red` → no alert, just colored in-app.

**B. Scheduled pace checks (Vercel cron).** For monthly cumulative KPIs (contracts, deals, revenue), compare **month-to-date actual** vs **expected pace** = `goal × (workdays_elapsed / workdays_in_month)`. Runs:
- **Midday check (~1pm local):** "On pace?" nudge for daily activity KPIs.
- **End-of-day check (~6pm local):** anyone who logged below daily goal or didn't enter at all.
- **Monthly pace check (every morning):** green money KPIs trending to miss the month.

**Severity → channel routing:**

| Severity | In-app | Google Chat | Email |
|---|:-:|:-:|:-:|
| 🟢 Hard (green miss / behind month pace) | ✅ banner | ✅ channel + @rep | ✅ rep + manager |
| 🔵 Soft (blue activity low) | ✅ flag | ✅ channel (digest) | ✅ daily digest only |
| 🟡🔴 | ✅ color only | — | — |

**Anti-noise rules:** one alert per KPI per rep per day (deduped); soft alerts batched into a single daily Chat/email digest; reps can **acknowledge** an alert to silence repeats; "missing entry" only fires after the workday cutoff.

---

## 6. Screens

1. **My Day (rep home)** — log in → today's date → your KPIs as big tap-friendly inputs, each turning 🟢/🟡/🔴 live as you type. Duration inputs (talk time) use an h:mm picker. One "Save day" button. Yesterday's numbers shown faintly for reference.
2. **Team Dashboard** — today's scoreboard: every rep × their KPIs in a color grid, plus the team funnel (Connected Calls → Leads → Appts → Contracts → Deals). Pace bars for the month. Designed to be readable on a wall-mounted TV.
3. **Monthly view** — financials + the derived ratios (Cost/Lead, ROI, Net Margin) with pace-to-goal bars and red/green deltas.
4. **Alerts inbox** — open flags, who/what/how-far-off, acknowledge/resolve.
5. **Admin / Settings** — manage reps, KPI catalog, goals & per-rep overrides, paste the Google Chat webhook, set email recipients, timezone, and workday cutoff. No code needed to add a KPI or change a goal.

**Readability principles:** large numbers, generous spacing, consistent color = status (never decoration), goal shown next to every value, mobile-first so reps can enter from their phone between calls.

---

## 7. Seed data (pre-loaded from your sheet so it's usable on day one)

KPI catalog pre-filled with category + goal, e.g.:

| KPI | Category | Scope | Cadence | Goal |
|---|---|---|---|---|
| Outbound Calls | 🔵 blue | per_rep | daily | ≥ 200 (Michelle) |
| Connected Calls | 🔵 blue | team | daily | ≥ 150 |
| On Call Time | 🔵 blue | per_rep | daily | ≥ 1:00 |
| Dialer Talk Time | 🔵 blue | per_rep | daily | ≥ 1:00 |
| CRM Talk Time | 🔵 blue | per_rep | daily | ≥ 2:00 |
| Leads Generated | 🟢 green | team | daily | ≥ 3 |
| Leads CC | 🟢 green | team | daily | ≥ 15 |
| Appointments Set | 🟢 green | team | daily | ≥ 20 |
| Appointments Taken | 🟢 green | team | daily | ≥ 100% |
| Contracts Sent | 🟢 green | team | monthly | ≥ 30 |
| Contracts Signed | 🟢 green | team | monthly | ≥ 10 |
| Deals Closed | 🟢 green | team | monthly | tracked |
| Gross Revenue / Mktg Spend / OpEx | 🟢 green | team | monthly | tracked |
| Cost/Lead, Cost/Deal, ROI, Net Margin | 🟡 yellow | team | monthly | computed |

(All editable in Admin — these are just the starting values.)

---

## 8. Build phases

- **Phase 0 — Scaffold & deploy skeleton.** Next.js app, Supabase project, deploy to Vercel so there's a live URL. *(no real features yet, but proves the pipeline)*
- **Phase 1 — Data model + seed.** Tables, KPI catalog seeded from your sheet, reps added.
- **Phase 2 — Entry + dashboard.** "My Day" entry screen and Team Dashboard with live color flags (in-app alerting works end-to-end).
- **Phase 3 — Alert engine.** On-entry + cron pace checks; Google Chat webhook + Resend email wired in; alerts inbox.
- **Phase 4 — Monthly/financials + Admin.** Derived ratios, settings/admin screens.
- **Phase 5 — Polish + optional import.** TV view, mobile pass, and (optional) a one-time importer to pull your historical 2026 numbers out of the existing sheet.

Each phase ends with something you can click and use.

---

## 9. Open items I need from you (only when we start building, not now)

1. **Roster:** real names + emails for each rep (Michelle, Ethan, Sharyn, Irish, + others) and who is "manager" for alert CCs.
2. **Org timezone** and the **workday cutoff** time for "missing entry" alerts.
3. **Google Chat space** you want alerts in (you'll generate the incoming-webhook URL; I'll show you where).
4. **Email** sender + recipient list for digests.
5. Confirm the **green/blue/yellow/red categorization** in §7 matches your intent.
6. Whether you want the **historical import** (Phase 5) or to start fresh on a clean date.

---

## 10. What this gets you vs. the spreadsheet

| | Spreadsheet today | This app |
|---|---|---|
| Entry | Scroll a 365-column grid | One screen, your KPIs only, on phone |
| Flagging | Manual eyeballing | Automatic 🟢🟡🔴 as you type |
| Notifications | None | In-app + Google Chat + email |
| Pace awareness | Month-end surprise | Daily "behind pace" alerts |
| Derived ratios | Fragile formulas (#DIV/0!) | Always-correct computed values |
| Multi-user | Everyone in one file | Each rep their own login |
