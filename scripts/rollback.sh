#!/usr/bin/env bash
# 🩹 One-command rollback (Jon 2026-10-26). Reverts the last deploy (or a specific commit) and
# pushes, so Vercel redeploys the previous known-good version. Recovery in seconds, not a scramble.
#   bash scripts/rollback.sh            # undo the most recent commit
#   bash scripts/rollback.sh <sha>      # undo a specific commit
# (Fastest of all: Vercel dashboard → the project → Deployments → the last green one →
#  "Promote to Production" / "Instant Rollback". This script is the git-side equivalent.)
set -euo pipefail
TARGET="${1:-HEAD}"
echo "Reverting commit: $TARGET"
git revert --no-edit "$TARGET"
git push origin main
echo "✅ Rollback pushed. Watch the redeploy, then run: bash scripts/smoke.sh"
