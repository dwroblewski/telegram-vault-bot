/**
 * Capture classifier service
 * Uses Gemini API directly to classify captures
 * NO hardcoded personal data - all customization via config
 */

import { buildClassifyPrompt } from '../prompts/classify.js';

const VALID_TYPES = ['person', 'project', 'knowledge', 'action', 'capture'];

/**
 * Fallback classification when API fails or returns invalid data
 */
export const FALLBACK_CLASSIFICATION = {
  type: 'capture',
  confidence: 0,
  title: 'Capture',
  topics: [],
  fields: {}
};

/**
 * Classify a capture using Gemini API
 * @param {string} text - Raw capture text
 * @param {Object} env - Cloudflare Worker environment with GEMINI_API_KEY
 * @param {Object} config - Vault config with topic_keywords
 * @returns {Object} Classification result matching schema
 */
export async function classifyCapture(text, env, config) {
  try {
    const model = env.MODEL || 'gemini-2.0-flash';
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return generateFallback(text);
    }

    const prompt = buildClassifyPrompt(config);
    const fullPrompt = `${prompt}\n\n## Text to Classify\n\n${text}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            maxOutputTokens: 512,
            temperature: 0.3,  // Lower temp for more consistent JSON
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      return generateFallback(text);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      console.error('No response from Gemini');
      return generateFallback(text);
    }

    const parsed = parseGeminiResponse(responseText);
    if (!parsed) {
      console.error('Failed to parse Gemini response:', responseText.substring(0, 200));
      return generateFallback(text);
    }

    const validated = validateClassification(parsed);
    if (!validated) {
      console.error('Failed to validate classification:', parsed);
      return generateFallback(text);
    }

    return validated;
  } catch (error) {
    console.error('Classification error:', error.message);
    return generateFallback(text);
  }
}

/**
 * Parse Gemini response string to JSON
 * @param {string} responseStr - Raw response from Gemini
 * @returns {Object|null} Parsed JSON or null if invalid
 */
function parseGeminiResponse(responseStr) {
  try {
    // Remove any markdown code fences if present
    let cleaned = responseStr.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3);
    }
    cleaned = cleaned.trim();

    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Validate and normalize classification object
 * @param {Object} classification - Parsed classification
 * @returns {Object|null} Validated classification or null if invalid
 */
export function validateClassification(classification) {
  if (!classification || typeof classification !== 'object') {
    return null;
  }

  // Type is required and must be valid
  if (!classification.type || !VALID_TYPES.includes(classification.type)) {
    return null;
  }

  // Confidence - required, clamped to 0-1
  let confidence = parseFloat(classification.confidence);
  if (isNaN(confidence)) {
    confidence = 0.5;
  }
  confidence = Math.max(0, Math.min(1, confidence));

  // Title - default if missing
  const title = classification.title || 'Untitled Capture';

  // Topics - must be array
  let topics = classification.topics;
  if (!Array.isArray(topics)) {
    topics = [];
  }

  // Fields - default to empty object
  const fields = classification.fields && typeof classification.fields === 'object'
    ? classification.fields
    : {};

  return {
    type: classification.type,
    confidence,
    title,
    topics,
    fields
  };
}

/**
 * Generate fallback classification from raw text
 * @param {string} text - Original capture text
 * @returns {Object} Fallback classification
 */
function generateFallback(text) {
  // Generate a simple title from first few words
  const words = text.split(/\s+/).slice(0, 5);
  const title = words.length > 0
    ? `Capture - ${words.join(' ')}`.slice(0, 50)
    : 'Capture';

  return {
    ...FALLBACK_CLASSIFICATION,
    title
  };
}
