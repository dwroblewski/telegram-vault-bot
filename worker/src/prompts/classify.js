/**
 * Classification prompt builder
 * Builds Gemini prompt with injected topic keywords from config
 * NO hardcoded personal data - all customization via config
 */

/**
 * Build classification prompt with config-injected topic keywords
 * @param {Object} config - Vault config with topic_keywords
 * @returns {string} Complete prompt for Gemini
 */
export function buildClassifyPrompt(config) {
  const topicList = Object.entries(config.topic_keywords || {})
    .map(([key, keywords]) => `- ${key}: ${keywords.join(', ')}`)
    .join('\n');

  return `You are a capture classifier for a personal knowledge vault.

Given raw text, classify it and return JSON only.

## Types

- person: Mentions a specific person by name with meaningful context (met someone, conversation about someone, contact info)
- project: Describes time-bound work with identifiable deliverables or next steps
- knowledge: Insight, observation, learning, or information worth preserving
- action: Task requiring execution (todo, reminder, errand, follow-up)
- capture: Default when uncertain or doesn't fit other types

## Topic Tags (for knowledge type)
${topicList || '(none configured)'}

## Output Schema

{
  "type": "person|project|knowledge|action|capture",
  "confidence": 0.0-1.0,
  "title": "Short descriptive title (3-7 words)",
  "topics": ["topic_key1", "topic_key2"],
  "fields": {
    // For person: { "context": "role/company", "follow_ups": ["action1"] }
    // For project: { "status": "active|planning|blocked", "next_action": "specific step" }
    // For knowledge: { "one_liner": "single sentence summary" }
    // For action: { "due_date": "YYYY-MM-DD or null" }
    // For capture: {}
  }
}

Rules:
- Return JSON only. No markdown fences. No explanation.
- topics: Return ALL matching topic keys, not just one. Empty array if none match.
- confidence 0.8+ = very clear match to type
- confidence 0.5-0.8 = reasonable match with some ambiguity
- confidence <0.5 = uncertain, probably should be capture
- title should be suitable as a filename (no special characters)
`;
}
