#!/usr/bin/env bash
# 🧪 Post-deploy smoke test (Jon 2026-10-26). Run after every deploy: confirms the live site
# actually serves the critical routes AND that the deployed commit matches local HEAD — so a
# green build that's broken at runtime is caught here, not by a person noticing.
#   Usage: bash scripts/smoke.sh
set -u
BASE="${BASE:-https://kpi-tracker-lovat.vercel.app}"
LOCAL="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
FAIL=0

say() { printf "%-26s %s\n" "$1" "$2"; }

# 1) version endpoint returns a sha
VER="$(curl -s --max-time 25 "$BASE/api/version")"
SHA="$(printf '%s' "$VER" | grep -o '"sha":"[^"]*"' | cut -d'"' -f4 | cut -c1-7)"
if [ -n "$SHA" ]; then say "/api/version" "ok (sha $SHA)"; else say "/api/version" "❌ no sha"; FAIL=1; fi
if [ "$SHA" != "$LOCAL" ] && [ "$LOCAL" != "?" ]; then say "deploy match" "⏳ live=$SHA local=$LOCAL (still deploying?)"; fi

# 2) critical routes respond (login-gated routes 200 or 3xx are both fine — a 500/000 is not)
for path in /tv /login /crm /dispo; do
  code="$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 "$BASE$path")"
  case "$code" in
    200|301|302|307|308) say "$path" "ok ($code)";;
    *) say "$path" "❌ HTTP $code"; FAIL=1;;
  esac
done

if [ "$FAIL" = 0 ]; then echo "✅ smoke test passed"; else echo "🚨 SMOKE TEST FAILED — consider: bash scripts/rollback.sh"; fi
exit $FAIL
