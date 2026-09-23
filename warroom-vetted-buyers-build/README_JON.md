# How to run this (5 steps)

1. Unzip → you get a folder `warroom-vetted-buyers-build/`.
2. Drag the **whole folder** into the root of your War Room repo (next to `package.json`).
3. Open the repo in VS Code → open Claude Code.
4. Paste this exactly:

   ```
   Read warroom-vetted-buyers-build/BUILD_SPEC.md and execute it phase by phase.
   Rule zero: never delete buyer data — archive only. Stop and ask me before any step that writes to the database.
   Start with Section 1 (orientation report), then wait for my "go".
   ```

5. Say **go** after each phase summary. Phase 1 will ask you to share the Drive folder `War Room Backups` with a service-account email — do that, then say go again.

## Env vars it will ask for (add to Vercel + .env)
- `CRON_SECRET` — any long random string (protects the nightly backup route)
- `GOOGLE_SERVICE_ACCOUNT_JSON` — from Google Cloud → IAM → Service Accounts → key (JSON). Share the Drive folder with that account's email.
- `GOOGLE_MAPS_API_KEY` (recommended, ~free at this volume) — or `MAPBOX_TOKEN` — or nothing (falls back to free Nominatim, slower)
- `ANTHROPIC_API_KEY` — for paste-to-fill

## What's already done outside the repo
- Drive backup #1: `War Room Backups / Vetted Buyers / vetted_buyers_2026-09-22_manual-snapshot.json`
- All 60 buy boxes parsed into structured form (`buybox/buybox_backfill_2026-09-22.json`) — check `buybox/backfill_review.csv` and tell Claude Code to fix any row you disagree with before Phase 2 loads it.
