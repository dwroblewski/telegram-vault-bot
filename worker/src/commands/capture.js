/**
 * Capture command - AI-powered capture with classification and routing
 * Classifies captures via Gemini and routes to appropriate folders
 * NO hardcoded personal data - all customization via config
 */
import { sendTelegram, reactToMessage, alertOnError } from '../services/telegram.js';
import { notifyGitHub } from '../services/github.js';
import { loadVaultConfig, DEFAULT_CONFIG } from '../services/config.js';
import { classifyCapture } from '../services/classifier.js';
import { renderNote, buildTags } from '../templates/index.js';
import { logCapture } from '../services/audit.js';

/**
 * Handle an incoming capture from Telegram
 * @param {Object} env - Cloudflare Worker environment
 * @param {number} chatId - Telegram chat ID
 * @param {number} messageId - Telegram message ID
 * @param {string} text - Raw capture text
 */
export async function handleCapture(env, chatId, messageId, text) {
  console.log(`Capture: chatId=${chatId}, messageId=${messageId}, text=${text.substring(0, 50)}`);

  const timestamp = new Date().toISOString();
  let config = DEFAULT_CONFIG;
  let classification = null;
  let destination = null;
  let tags = [];
  let error = null;

  try {
    // Load config from R2
    config = await loadVaultConfig(env);

    // Classify the capture
    classification = await classifyCapture(text, env, config);

    // Determine destination folder
    destination = determineDestination(classification, config, timestamp);

    // Build tags
    tags = buildTags(classification.type, classification.topics || [], config);

    // Render the note
    const noteContent = renderNote(classification, text, timestamp, config);

    // Write to R2
    console.log(`Writing to R2: ${destination}`);
    await env.VAULT.put(destination, noteContent, {
      httpMetadata: { contentType: 'text/markdown' }
    });

    // Trigger GitHub sync (fire-and-forget)
    const filename = destination.split('/').pop();
    notifyGitHub(filename, env, chatId).catch(e => {
      console.log(`GitHub notify failed: ${e.message}`);
      alertOnError(env, 'notifyGitHub', e);
    });

    // Respond based on confidence level
    await respondToCapture(env, chatId, messageId, classification, config);

  } catch (e) {
    console.error('Capture error:', e);
    error = e.message;

    // Fall back to basic capture
    try {
      const fallbackPath = createFallbackCapture(env, text, timestamp);
      destination = fallbackPath;

      // Still send error feedback
      await sendTelegram(env, chatId, `⚠️ Classified with fallback: ${error}`);
    } catch (fallbackError) {
      await sendTelegram(env, chatId, `❌ Capture failed: ${fallbackError.message}`);
    }
  }

  // Always log to audit trail
  try {
    await logCapture(env, {
      telegramMsgId: messageId,
      raw: text,
      classification,
      destination,
      tags,
      error
    });
  } catch (auditError) {
    console.error('Audit log failed:', auditError.message);
  }
}

/**
 * Determine destination path based on classification and config
 * @param {Object} classification - Classification result
 * @param {Object} config - Vault config
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Full destination path
 */
function determineDestination(classification, config, timestamp) {
  const { type, confidence, title } = classification;
  const thresholds = config.thresholds || { high_confidence: 0.7, medium_confidence: 0.5 };

  // Low confidence always goes to inbox
  if (confidence < thresholds.medium_confidence) {
    const folder = config.folders?.low_confidence || '0-Inbox';
    return `${folder}/${sanitizeFilename(title, timestamp)}.md`;
  }

  // Get folder for this type
  const folder = config.folders?.[type] || getDefaultFolder(type);

  return `${folder}/${sanitizeFilename(title, timestamp)}.md`;
}

/**
 * Get default folder for a type
 * @param {string} type - Classification type
 * @returns {string} Default folder path
 */
function getDefaultFolder(type) {
  const defaults = {
    person: 'People',
    project: 'Projects',
    knowledge: 'Knowledge',
    action: '0-Inbox',
    capture: '0-Inbox'
  };
  return defaults[type] || '0-Inbox';
}

/**
 * Sanitize title for use as filename
 * @param {string} title - Original title
 * @param {string} timestamp - ISO timestamp for uniqueness
 * @returns {string} Safe filename (without extension)
 */
function sanitizeFilename(title, timestamp) {
  // Remove/replace unsafe characters
  let safe = title
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  // Add timestamp suffix for uniqueness
  const timepart = timestamp.replace(/[:.]/g, '-').slice(0, 19);

  return `${safe} - ${timepart}`;
}

/**
 * Respond to user based on confidence level
 * @param {Object} env - Worker environment
 * @param {number} chatId - Telegram chat ID
 * @param {number} messageId - Message ID
 * @param {Object} classification - Classification result
 * @param {Object} config - Vault config
 */
async function respondToCapture(env, chatId, messageId, classification, config) {
  const { type, confidence, title } = classification;
  const thresholds = config.thresholds || { high_confidence: 0.7, medium_confidence: 0.5 };

  if (confidence >= thresholds.high_confidence) {
    // High confidence: just thumbs up
    await reactToMessage(env, chatId, messageId, '👍');
  } else if (confidence >= thresholds.medium_confidence) {
    // Medium confidence: route + confirmation
    await reactToMessage(env, chatId, messageId, '👍');
    await sendTelegram(env, chatId, `📝 ${type}: "${title}"`);
  } else {
    // Low confidence: inbox + hint
    await sendTelegram(env, chatId, `📥 Inbox. Prefix with type to route.`);
  }
}

/**
 * Create fallback capture when classification fails
 * @param {Object} env - Worker environment
 * @param {string} text - Raw text
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Destination path
 */
async function createFallbackCapture(env, text, timestamp) {
  const timepart = timestamp.replace(/[:.]/g, '-');
  const filename = `telegram-${timepart}.md`;
  const destination = `0-Inbox/${filename}`;

  const content = `#telegram #capture #needs-review

${text}

---
*Captured via Telegram: ${timestamp}*
*Classification failed - manual review needed*
`;

  await env.VAULT.put(destination, content, {
    httpMetadata: { contentType: 'text/markdown' }
  });

  return destination;
}
