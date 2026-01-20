/**
 * Capture classifier service
 * Uses Gemini via Cloudflare Workers AI to classify captures
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
 * Classify a capture using Gemini via Workers AI
 * @param {string} text - Raw capture text
 * @param {Object} env - Cloudflare Worker environment with AI binding
 * @param {Object} config - Vault config with topic_keywords
 * @returns {Object} Classification result matching schema
 */
export async function classifyCapture(text, env, config) {
  try {
    const prompt = buildClassifyPrompt(config);
    const fullPrompt = `${prompt}\n\n## Text to Classify\n\n${text}`;

    const response = await env.AI.run('@cf/google/gemini-1.5-flash', {
      prompt: fullPrompt,
      max_tokens: 512
    });

    if (!response || !response.response) {
      return generateFallback(text);
    }

    const parsed = parseGeminiResponse(response.response);
    if (!parsed) {
      return generateFallback(text);
    }

    const validated = validateClassification(parsed);
    if (!validated) {
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
