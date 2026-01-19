# Security

## Reporting Vulnerabilities

Email security issues to: [create a security@yourdomain or use GitHub security advisories]

Do not open public issues for security vulnerabilities.

## Security Model

### What's Protected

- **Authentication**: Single-user mode via `ALLOWED_USER_ID` - only your Telegram user can interact
- **Webhook validation**: `WEBHOOK_SECRET` validates requests come from Telegram
- **Telegram IP allowlist**: Worker only accepts webhooks from Telegram's IP ranges
- **Rate limiting**: 20 requests per minute per user to prevent abuse
- **Prompt injection filtering**: Known attack patterns are sanitized before reaching Gemini
- **Export endpoint auth**: `/captures/export` requires Bearer token

### What's NOT Protected

- **Filter patterns are visible**: The `sanitizeQuery` function is open source. Attackers can see what's filtered. This is intentional - security through obscurity is weak. The filters still block attacks even when visible.
- **Single point of auth**: If `ALLOWED_USER_ID` is compromised, attacker has full access. Mitigate by keeping your Telegram account secure.
- **No encryption at rest**: Captures in R2 are not encrypted beyond Cloudflare's default. Don't capture highly sensitive data.

## Required Configuration

These secrets MUST be set for secure operation:

| Secret | Purpose | Required |
|--------|---------|----------|
| `ALLOWED_USER_ID` | Restricts bot to your Telegram ID only | **Yes** |
| `WEBHOOK_SECRET` | Validates webhook requests from Telegram | **Yes** |
| `TELEGRAM_BOT_TOKEN` | Bot authentication | **Yes** |
| `GEMINI_API_KEY` | AI queries | **Yes** |

### Setting Webhook Secret

1. Generate a random secret:
   ```bash
   openssl rand -hex 32
   ```

2. Set in Cloudflare:
   ```bash
   npx wrangler secret put WEBHOOK_SECRET
   ```

3. Configure Telegram webhook with secret:
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>/webhook&secret_token=<SECRET>"
   ```

## Telegram IP Ranges

The worker validates that webhook requests come from Telegram's documented IP ranges:
- 149.154.160.0/20
- 91.108.4.0/22

Requests from other IPs are rejected with 403.

## Rate Limiting

- 20 requests per minute per chat ID
- Exceeding limit returns "Rate limited" message
- Resets after 60 seconds of no requests

## Dependencies

- **Cloudflare Workers**: Edge compute, managed by Cloudflare
- **Cloudflare R2**: Object storage, managed by Cloudflare
- **Gemini API**: Google's AI, see [Google's security practices](https://cloud.google.com/security)
- **Telegram Bot API**: See [Telegram's privacy policy](https://telegram.org/privacy)

## Recommendations

1. **Rotate secrets periodically** - Especially `WEBHOOK_SECRET` and `GITHUB_TOKEN`
2. **Monitor Cloudflare logs** - Use `wrangler tail` to watch for suspicious activity
3. **Keep dependencies updated** - Run `npm audit` periodically
4. **Don't capture secrets** - Avoid sending API keys, passwords, or tokens to the bot
