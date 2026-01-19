#!/bin/bash
# verify-setup.sh - Verify telegram-vault-bot setup is complete
#
# Usage: ./scripts/verify-setup.sh
#
# Checks:
# 1. Worker deployed and healthy
# 2. Telegram webhook configured
# 3. R2 bucket has vault context
# 4. Bot can send messages (optional, requires TELEGRAM_BOT_TOKEN)

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Save external env vars before .env might overwrite them
_EXT_WORKER_URL="${WORKER_URL-}"
_WORKER_URL_SET="${WORKER_URL+yes}"
_EXT_TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN-}"
_TELEGRAM_BOT_TOKEN_SET="${TELEGRAM_BOT_TOKEN+yes}"

# Load .env if present
if [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a; source "$SCRIPT_DIR/../.env"; set +a
fi

# External environment overrides .env (allows testing with specific values)
[ -n "$_WORKER_URL_SET" ] && WORKER_URL="$_EXT_WORKER_URL"
[ -n "$_TELEGRAM_BOT_TOKEN_SET" ] && TELEGRAM_BOT_TOKEN="$_EXT_TELEGRAM_BOT_TOKEN"

WORKER_URL="${WORKER_URL:-}"
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"

echo "=== Telegram Brain Setup Verification ==="
echo ""

PASS=0
FAIL=0
WARN=0

check_pass() {
  echo -e "  ${GREEN}✓${NC} $1"
  PASS=$((PASS + 1))
}

check_fail() {
  echo -e "  ${RED}✗${NC} $1"
  FAIL=$((FAIL + 1))
}

check_warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
  WARN=$((WARN + 1))
}

# === 1. Worker URL ===
echo "1. Worker Configuration"

if [ -z "$WORKER_URL" ]; then
  # Try to find from wrangler
  if command -v wrangler &> /dev/null; then
    WORKER_URL=$(cd "$SCRIPT_DIR/../worker" && wrangler whoami 2>/dev/null | grep -oP 'https://[^\s]+workers.dev' | head -1 || echo "")
  fi
fi

if [ -z "$WORKER_URL" ]; then
  check_fail "WORKER_URL not set in .env"
  echo "       Add: WORKER_URL=https://your-worker.workers.dev"
else
  check_pass "WORKER_URL: $WORKER_URL"
fi

# === 2. Worker Health ===
echo ""
echo "2. Worker Health"

if [ -n "$WORKER_URL" ]; then
  HEALTH=$(curl -sf "$WORKER_URL/health" 2>/dev/null || echo '{"status":"unreachable"}')
  STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "error")

  if [ "$STATUS" = "healthy" ]; then
    check_pass "Worker responding: $STATUS"

    # Check individual components
    GEMINI=$(echo "$HEALTH" | jq -r '.checks.gemini' 2>/dev/null)
    TELEGRAM=$(echo "$HEALTH" | jq -r '.checks.telegram' 2>/dev/null)
    VAULT_OK=$(echo "$HEALTH" | jq -r '.checks.vault.ok' 2>/dev/null)
    VAULT_KB=$(echo "$HEALTH" | jq -r '.checks.vault.sizeKB' 2>/dev/null)

    [ "$GEMINI" = "true" ] && check_pass "GEMINI_API_KEY configured" || check_fail "GEMINI_API_KEY missing"
    [ "$TELEGRAM" = "true" ] && check_pass "TELEGRAM_BOT_TOKEN configured" || check_fail "TELEGRAM_BOT_TOKEN missing"
    [ "$VAULT_OK" = "true" ] && check_pass "Vault context: ${VAULT_KB}KB" || check_fail "Vault context missing (run sync-vault.sh)"
  elif [ "$STATUS" = "degraded" ]; then
    check_warn "Worker degraded: check secrets"
    echo "$HEALTH" | jq -r '.checks' 2>/dev/null || true
  else
    check_fail "Worker unreachable at $WORKER_URL"
  fi
else
  check_fail "Cannot check health (no WORKER_URL)"
fi

# === 3. Telegram Webhook ===
echo ""
echo "3. Telegram Webhook"

if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$WORKER_URL" ]; then
  WEBHOOK_INFO=$(curl -sf "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" 2>/dev/null || echo '{}')
  WEBHOOK_URL=$(echo "$WEBHOOK_INFO" | jq -r '.result.url' 2>/dev/null || echo "")

  if [ -z "$WEBHOOK_URL" ] || [ "$WEBHOOK_URL" = "null" ] || [ "$WEBHOOK_URL" = "" ]; then
    check_fail "Webhook not set"
    echo "       Run: curl \"https://api.telegram.org/bot\$TOKEN/setWebhook?url=$WORKER_URL/webhook\""
  elif [[ "$WEBHOOK_URL" == *"/webhook"* ]]; then
    check_pass "Webhook configured: $WEBHOOK_URL"

    # Check for errors
    LAST_ERROR=$(echo "$WEBHOOK_INFO" | jq -r '.result.last_error_message // empty' 2>/dev/null)
    if [ -n "$LAST_ERROR" ]; then
      check_warn "Last webhook error: $LAST_ERROR"
    fi
  else
    check_warn "Webhook URL doesn't end with /webhook: $WEBHOOK_URL"
  fi
else
  check_warn "Cannot check webhook (need TELEGRAM_BOT_TOKEN in .env)"
fi

# === 4. Local Secrets ===
echo ""
echo "4. Local Configuration (.env)"

[ -n "$TELEGRAM_BOT_TOKEN" ] && check_pass "TELEGRAM_BOT_TOKEN set" || check_warn "TELEGRAM_BOT_TOKEN not in .env (optional for local)"
[ -n "${GEMINI_API_KEY:-}" ] && check_pass "GEMINI_API_KEY set" || check_warn "GEMINI_API_KEY not in .env (optional for local)"
[ -n "${CLOUDFLARE_API_TOKEN:-}" ] && check_pass "CLOUDFLARE_API_TOKEN set" || check_warn "CLOUDFLARE_API_TOKEN not in .env (needed for sync-vault.sh)"
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] && check_pass "CLOUDFLARE_ACCOUNT_ID set" || check_warn "CLOUDFLARE_ACCOUNT_ID not in .env (needed for sync-vault.sh)"

# === 5. Vault Repo Secrets (informational) ===
echo ""
echo "5. Vault Repo Secrets (verify manually in GitHub)"
echo "   Required in your vault repo → Settings → Secrets → Actions:"
echo "   - R2_ACCESS_KEY_ID"
echo "   - R2_SECRET_ACCESS_KEY"
echo "   - R2_ACCOUNT_ID"
echo "   - TELEGRAM_BOT_TOKEN (for digest/alerts)"
echo "   - TELEGRAM_CHAT_ID (for digest/alerts)"

# === Summary ===
echo ""
echo "=== Summary ==="
echo -e "  ${GREEN}Passed:${NC} $PASS"
[ $WARN -gt 0 ] && echo -e "  ${YELLOW}Warnings:${NC} $WARN"
[ $FAIL -gt 0 ] && echo -e "  ${RED}Failed:${NC} $FAIL"

echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}Setup looks good!${NC}"
  echo ""
  echo "Quick test: Send a message to your bot on Telegram"
  exit 0
else
  echo -e "${RED}Setup incomplete. Fix the issues above.${NC}"
  exit 1
fi
