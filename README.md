# KPI Tracker

A daily scorecard for a real-estate acquisitions team that **flags off-target
KPIs automatically** and notifies the team in-app, on Google Chat, and by email —
replacing a passive Google Sheet.

Built with Next.js 16, React 19, Tailwind v4, Prisma. See [`docs/SPEC.md`](docs/SPEC.md)
for the full design and [`docs/DEPLOY.md`](docs/DEPLOY.md) to ship it.

## Run locally

```bash
# Node 18+ required (this machine uses nvm: `nvm use --lts`)
npm install
npm run db:migrate     # creates the SQLite dev DB
npm run db:seed        # loads the 24 KPIs + reps from the sheet
npm run dev            # http://localhost:3000
```

## Screens

| Route | What it is |
|---|---|
| `/dashboard` (`/`) | Team scoreboard — today's KPIs + monthly pace, color-flagged |
| `/entry` | Fast KPI entry per rep, live green/amber/red as you type |
| `/monthly` | Monthly financials + computed ratios (Cost/Lead, ROI, Net Margin) |
| `/alerts` | Alert inbox — acknowledge / resolve |
| `/admin` | Manage reps, KPIs, goals, webhook, email, timezone |
| `/tv` | Full-screen wall display, auto-refreshes every 60s |
| `/api/cron` | Scheduled alert check (Vercel Cron hits this) |

## How alerting works

Each KPI has a category from the team's legend, which sets alert urgency:

- 🟢 **green** (money KPIs) → **hard alert**: in-app + Google Chat + email, immediately
- 🔵 **blue** (activity drivers) → **soft alert**: in-app now, batched into a daily digest
- 🟡 **yellow** / 🔴 **red** → tracked only, never alerts

Alerts fire two ways: instantly when a below-goal number is saved, and on a
schedule (pace checks + missing-entry nudges) via `/api/cron`.

## Useful scripts

```bash
npm run db:studio   # browse/edit the database in a GUI
npm run db:reset    # wipe + re-migrate + re-seed
npm run build       # production build (stop the dev server first)
```
