# CLAUDE.md - telegram-vault-bot

## Repository Type: PUBLIC

This repository is **public on GitHub**. All code, commits, and content are visible to anyone.

---

## PRIVACY RULES (NON-NEGOTIABLE)

### NEVER include in this repo:

1. **Personal topic tags** — No `#genai`, `#career`, `#pe`, `#work` or any user-specific tags
2. **Personal folder paths** — No `Areas/Area-Example`, `Projects/Project-Example`, etc.
3. **Real capture examples** — No actual messages from any user's vault
4. **Specific _vault_context.md content** — Only templates/examples with placeholders
5. **Evidence logs from personal testing** — Keep in private repos
6. **References to specific users or vaults** — No usernames, personal details
7. **API keys or secrets** — Even in examples (use `YOUR_API_KEY_HERE`)

### ALWAYS use:

1. **Generic folder defaults**: `People`, `Projects`, `Knowledge`, `0-Inbox`, `Resources`, `Archive`
2. **Synthetic test data**: `"met jane at tech conference"`, `"project idea: build widget"`
3. **Placeholder topics**: `topic1: keyword1, keyword2` or `genai: AI, LLM, ML` (generic, not personal)
4. **Config injection** — Never hardcode personal values, always load from `_vault_context.md`
5. **Example templates** — `_vault_context.example.md` with placeholder values

### Before ANY commit:

```bash
# 1. Review the diff
git diff --staged

# 2. Search for personal data patterns
git diff --staged | grep -iE "(user|owner|company1|company2|area-example|job-search)"

# 3. If ANY match found: DO NOT COMMIT
# 4. If uncertain: ASK FIRST
```

---

## Architecture

This bot is designed to be **generic and reusable**:

```
User's R2 Bucket (private)
├── _vault_context.md      ← Personal config (folders, tags, topics)
└── [vault files]          ← User's notes

Worker (public code)
├── Loads config from R2
├── Classifies captures
├── Routes based on USER's config
└── Never contains personal values
```

---

## Development Commands

```bash
# Deploy worker
cd worker && npx wrangler deploy

# Set secrets (user does this, not in code)
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY

# Test locally
npx wrangler dev
```

---

## File Structure

```
telegram-vault-bot/
├── worker/
│   └── src/
│       ├── index.js           # Main entry
│       ├── commands/          # Telegram command handlers
│       ├── services/          # Business logic (classifier, audit, config)
│       ├── prompts/           # Generic classification prompts
│       └── templates/         # Note rendering templates
├── _vault_context.example.md  # Template for users to customize
├── README.md                  # Public documentation
└── CLAUDE.md                  # This file
```

---

## Testing Guidelines

- Use synthetic/generic test data only
- No real captures in test fixtures
- Example: `{ "text": "met jane at acme corp", "expected_type": "person" }`
- Never commit logs from personal vault testing

---

*This is a public repository. When in doubt, leave it out.*
