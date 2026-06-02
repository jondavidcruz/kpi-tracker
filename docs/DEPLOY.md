# Deploying the KPI Tracker (Supabase + Vercel)

This takes the app from your laptop to a live URL your team opens in a browser.
Budget ~30–45 minutes. Everything here has a free tier.

---

## 0. What you'll end up with

- A live app at `https://your-app.vercel.app`
- A Postgres database on Supabase
- Automatic alert checks 3×/day via Vercel Cron
- Alerts delivered to Google Chat + email

---

## 1. Put the code on GitHub

```bash
cd "kpi-tracker"
git add -A
git commit -m "KPI tracker"
# create a repo at github.com/new (private is fine), then:
git remote add origin https://github.com/<you>/kpi-tracker.git
git branch -M main
git push -u origin main
```

---

## 2. Create the database (Supabase)

1. Go to https://supabase.com → **New project**. Pick a strong DB password and save it.
2. In the project: **Project Settings → Database → Connection string → "URI"**.
   - Copy the **Transaction pooler** URI (port `6543`) → this is your `DATABASE_URL`.
   - Copy the **Direct connection** URI (port `5432`) → this is your `DIRECT_URL` (used for migrations).

### Switch Prisma from SQLite to Postgres

Edit `prisma/schema.prisma` — change the datasource block to:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

Then, locally, point at Supabase and create the tables + seed:

```bash
export DATABASE_URL="postgresql://...6543/postgres?pgbouncer=true"
export DIRECT_URL="postgresql://...5432/postgres"
npx prisma migrate deploy   # creates tables from prisma/migrations
npm run db:seed             # loads your 24 KPIs + reps
```

> Tip: keep using SQLite locally by leaving your `.env` as `file:./dev.db`; only
> set the Postgres URLs when you want to talk to Supabase.

---

## 3. Deploy to Vercel

1. Go to https://vercel.com → **Add New → Project** → import your GitHub repo.
2. Framework preset auto-detects **Next.js**. Leave build settings default.
3. Under **Environment Variables**, add (Production + Preview):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler URI (port 6543, add `?pgbouncer=true`) |
   | `DIRECT_URL` | Supabase direct URI (port 5432) |
   | `CRON_SECRET` | a long random string (e.g. `openssl rand -hex 24`) |
   | `RESEND_API_KEY` | from step 5 (optional) |
   | `ALERT_EMAIL_FROM` | e.g. `kpi-alerts@yourdomain.com` (optional) |

4. Click **Deploy**. When it's live, open the URL → you should see the dashboard.

The cron jobs in `vercel.json` start running automatically. Vercel attaches
`Authorization: Bearer $CRON_SECRET` to each call, which `/api/cron` verifies.

> **Cron times are UTC.** The defaults (`12:00`, `17:00`, `22:00` UTC) ≈ 8am /
> 1pm / 6pm US-Eastern. Adjust the cron lines in `vercel.json` for your timezone.

---

## 4. Google Chat alerts

1. Open the Google Chat **Space** where alerts should land.
2. Space name → **Apps & integrations → Manage webhooks → Add webhook**.
3. Name it "KPI Tracker", copy the **webhook URL**.
4. In the app: **Admin → Alerts & schedule → Google Chat webhook URL** → paste → Save.

That's it — no Google OAuth needed.

---

## 5. Email alerts (Resend)

1. Sign up at https://resend.com (free tier).
2. **API Keys → Create** → copy the key → set as `RESEND_API_KEY` in Vercel.
3. Verify a sending domain (or use Resend's test domain to start).
4. In the app: **Admin** → set **Alert email recipients** and **Email from address**.

If `RESEND_API_KEY` is unset, email simply no-ops — the app still works.

---

## 6. First-run setup (in the app)

1. **Admin → People:** replace the placeholder emails with your reps' real
   addresses; add/remove people; set who is `manager`.
2. **Admin → KPIs & goals:** confirm the 🟢🔵🟡🔴 categories and tweak any goals.
3. **Admin → Alerts & schedule:** set your **org timezone** and **workday cutoff**.
4. **Enter KPIs:** have a rep log a day and watch the dashboard + alerts react.

To test alerts immediately without waiting for cron, visit:
`https://your-app.vercel.app/api/cron?secret=YOUR_CRON_SECRET&force=1`

---

## 7. Known follow-up: real login

Today the app uses a **rep picker** (no password) — fine for a trusted internal
team on a private URL. To add proper per-person login (magic-link email), wire in
**Supabase Auth**: enable Email provider in Supabase, add `@supabase/supabase-js`,
gate pages behind a session, and map the signed-in email to a `User` row. This is
the recommended next step before exposing the app beyond your team. (Happy to
build this out — it's scoped in the spec as a Phase 5 stretch item.)
