#!/bin/bash
# Deploy with release notification
# Usage: npm run release
#   or:  TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx npm run release

set -e

cd "$(dirname "$0")/.."

# Get release info
VERSION=$(date +%Y%m%d-%H%M)
LAST_3=$(git log --oneline -3 --no-decorate)
LAST_MSG=$(git log -1 --pretty=format:"%s")

echo "📦 Deploying telegram-vault-bot v$VERSION"
echo ""

# Run tests first
echo "🧪 Running tests..."
npm test
echo ""

# Deploy
echo "🚀 Deploying to Cloudflare..."
wrangler deploy
echo ""
echo "✅ Deployed!"
echo ""

# Build test suggestions based on changes
TESTS=""
[[ "$LAST_3" =~ [Ss]hadow ]] && TESTS="$TESTS
• Shadow mode: all captures → inbox with 🔬 feedback"
[[ "$LAST_3" =~ [Cc]lassif ]] && TESTS="$TESTS
• Try: 'met sarah from acme' → person
• Try: 'TIL about transformers' → knowledge [genai]"
[[ "$LAST_3" =~ [Aa]udit ]] && TESTS="$TESTS
• Check: 0-Inbox/_capture_log.jsonl"
[[ "$LAST_3" =~ [Mm]ulti.topic ]] && TESTS="$TESTS
• Try: 'AI in PE diligence' → [genai, pe]"

# Default if nothing matched
[ -z "$TESTS" ] && TESTS="
• Send a test capture and verify response"

# Release message
MSG="🚀 telegram-vault-bot deployed

📌 $VERSION

Changes:
$LAST_3

What to try:$TESTS"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "$MSG"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Send to Telegram if tokens available
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
  echo ""
  echo "📨 Sending to Telegram..."
  curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -d "chat_id=${TELEGRAM_CHAT_ID}" \
    -d "text=$MSG" > /dev/null && echo "✅ Sent!"
else
  echo ""
  echo "💡 To auto-send release notes, run with:"
  echo "   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx npm run release"
fi
