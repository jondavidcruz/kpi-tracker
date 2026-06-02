# 🚀 Go-Live Runbook — KPI Tracker

A tight, copy-paste checklist to take the app live. **~30–45 min.** Everything has a free tier.
You'll do three signups (GitHub, Supabase, Vercel); I've prepped everything on the code side.

> Items marked **[you]** need your account/credentials — I can't do these for you.
> When you're ready to do this together, just say so and I'll walk each step live.

---

## What you'll have at the end
- Live app at `https://<your-app>.vercel.app` your team opens in any browser
- Postgres database (Supabase) — survives restarts, multi-user safe
- Automatic alert checks 3×/day (Vercel Cron) → Google Chat + email
- Seed data already loaded: **6 people, 34 KPIs, 7 per-rep goal overrides**

---

## STEP 1 — Push code to GitHub **[you]**
```bash
cd "/Users/joncruz/Claude Code/kpi-tracker"
git add -A
git commit -m "KPI tracker — ready for deploy"
# create a PRIVATE repo at https://github.com/new (don't add a README), then:
git remote add origin https://github.com/<you>/kpi-tracker.git
git branch -M main
git push -u origin main
```

## STEP 2 — Create the database **[you]**
1. https://supabase.com → **New project**. Set a strong DB password — **save it**.
2. **Project Settings → Database → Connection string → URI**. Copy two values:
   - **Transaction pooler** (port `6543`) → your `DATABASE_URL` (add `?pgbouncer=true`)
   - **Direct connection** (port `5432`) → your `DIRECT_URL`

## STEP 3 — Switch Prisma to Postgres ⚠️ *(do this WITH me — has a gotcha)*
The current migrations were built for SQLite, so a plain `migrate deploy` will error
on Postgres. Clean path for a fresh DB:

```bash
# 3a. Edit prisma/schema.prisma datasource block to:
#   datasource db {
#     provider  = "postgresql"
#     url       = env("DATABASE_URL")
#     directUrl = env("DIRECT_URL")
#   }

# 3b. Regenerate migrations for Postgres (old SQLite ones are dev-only, safe to drop):
rm -rf prisma/migrations

# 3c. Point at Supabase and create tables + seed:
export DATABASE_URL="postgresql://...6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://...5432/postgres"
npx prisma migrate dev --name init   # creates Postgres tables
npm run db:seed                       # loads 6 people, 34 KPIs, 7 targets

# 3d. Commit the new migrations + schema:
git add -A && git commit -m "Switch to Postgres for production" && git push
```
> Keep local dev on SQLite: leave your `.env` as `file:./dev.db`; only export the
> Postgres URLs in the shell when talking to Supabase.

## STEP 4 — Deploy to Vercel **[you]**
1. https://vercel.com → **Add New → Project** → import the GitHub repo.
2. It auto-detects Next.js. Leave build settings default.
3. **Environment Variables** (Production + Preview):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler URI (6543, `?pgbouncer=true`) |
   | `DIRECT_URL` | Supabase direct URI (5432) |
   | `CRON_SECRET` | random string — run `openssl rand -hex 24` |
   | `RESEND_API_KEY` | optional, from Step 6 |
   | `ALERT_EMAIL_FROM` | optional, e.g. `kpi-alerts@yourdomain.com` |

4. **Deploy.** Open the URL → you should see the dashboard.

> Cron times are **UTC**. Defaults `12/17/22 UTC` ≈ 8am/1pm/6pm Eastern.
> Adjust the lines in `vercel.json` for your timezone if needed.

## STEP 5 — Google Chat alerts **[you]**
1. Open the Chat **Space** for alerts → **Apps & integrations → Manage webhooks → Add**.
2. Name it "KPI Tracker", copy the **webhook URL**.
3. In the app: **Admin → Alerts & schedule → Google Chat webhook URL** → paste → Save.
   *(No Google OAuth needed.)*

## STEP 6 — Email alerts (optional) **[you]**
1. https://resend.com → free tier → **API Keys → Create** → set as `RESEND_API_KEY` in Vercel.
2. Verify a sending domain (or use Resend's test domain to start).
3. App: **Admin →** set **Alert email recipients** + **Email from address**.
   *(If `RESEND_API_KEY` is unset, email just no-ops — app still works.)*

## STEP 7 — First-run setup (in the app) **[you]**
1. **Admin → People:** swap placeholder emails for real ones; set who is `manager`.
   *(Ethan is already flagged irregular-schedule = no missing-entry nags.)*
2. **Admin → Alerts & schedule:** set **org timezone** + **workday cutoff**.
3. **Admin → KPIs & goals:** the realistic goals are pre-loaded — eyeball and tweak.
4. **Enter KPIs:** have a rep log a day; watch the dashboard + alerts react.

**Test alerts immediately** (no waiting for cron):
`https://<your-app>.vercel.app/api/cron?secret=YOUR_CRON_SECRET&force=1`

---

## ⚠️ Before sharing widely: login
The app currently uses a **rep-picker (no password)** — fine for a trusted team on a
private URL today. Add **Supabase magic-link login** before exposing it further.
This is the agreed next build item.

## Pre-loaded goals (reference)
| Role | Person(s) | Key daily goals |
|---|---|---|
| CC/LM | Irish (25h) | Dials 120 · Connections 90 · Quality Convos 10 · Appts Set 3 |
| Acquisitions | Michelle (37h) | Offers 2 · Talk 1:30 · Appts Taken 100% |
| Acquisitions | Ethan (PT, irregular) | Offers 1 · no missing-entry alerts |
| Dispositions | Sharyn (37h) | Buyers 140 · New Buyers 3 · Deals Sold 4 |
| Dispositions | Marie (25h) | Buyers 80 · New Buyers 2 · Deals Sold 2 |
| Team / month | — | Contracts Sent 20 · Signed 6 |
