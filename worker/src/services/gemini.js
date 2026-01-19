/**
 * Gemini API service
 */

/**
 * Sanitize user query to prevent basic prompt injection
 */
export function sanitizeQuery(query) {
  // Remove potential instruction overrides
  const dangerous = [
    /ignore (all )?(previous |above |prior )?instructions/gi,
    /disregard (all )?(previous |above |prior )?instructions/gi,
    /forget (all )?(previous |above |prior )?instructions/gi,
    /you are now/gi,
    /new instructions:/gi,
    /system prompt:/gi,
  ];

  let sanitized = query;
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, '[removed]');
  }

  // Limit length to prevent context stuffing attacks
  return sanitized.slice(0, 1000);
}

/**
 * Query Gemini with vault context
 */
export async function queryGemini(env, vaultContent, query) {
  const model = env.MODEL || 'gemini-2.5-flash-lite';
  const apiKey = env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const sanitizedQuery = sanitizeQuery(query);

  const prompt = `You are a helpful assistant with access to a personal knowledge vault.

Here is the vault content:

${vaultContent}

---

Based on the vault content above, answer this question:
${sanitizedQuery}

Be concise and specific. If you can't find relevant information in the vault, say so.
Cite which files you found the information in when relevant.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0.7,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();

  // Extract response text
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('No response from Gemini');
  }

  return text;
}
