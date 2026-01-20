/**
 * Audit logger for capture tracking
 * Appends JSONL entries to _capture_log.jsonl in R2
 * Trust maintenance: "You abandon systems because errors feel mysterious" - Nate B Jones
 */

export const LOG_PATH = '0-Inbox/_capture_log.jsonl';

/**
 * Log a capture to the audit trail
 * @param {Object} env - Cloudflare Worker environment with VAULT binding
 * @param {Object} entry - Capture entry to log
 * @param {number} entry.telegramMsgId - Telegram message ID
 * @param {string} entry.raw - Raw capture text
 * @param {Object|null} entry.classification - Classification result or null on error
 * @param {string|null} entry.destination - Destination path or null on error
 * @param {string[]} entry.tags - Tags applied to note
 * @param {string|null} entry.error - Error message or null on success
 */
export async function logCapture(env, entry) {
  const logEntry = {
    ts: new Date().toISOString(),
    telegram_msg_id: entry.telegramMsgId,
    raw: entry.raw,
    classification: entry.classification,
    destination: entry.destination,
    tags: entry.tags,
    error: entry.error
  };

  const jsonLine = JSON.stringify(logEntry);

  try {
    // Read existing log
    let existingContent = '';
    try {
      const existing = await env.VAULT.get(LOG_PATH);
      if (existing) {
        existingContent = await existing.text();
      }
    } catch {
      // Log doesn't exist or read failed, start fresh
      existingContent = '';
    }

    // Append new entry
    const newContent = existingContent
      ? existingContent.trimEnd() + '\n' + jsonLine + '\n'
      : jsonLine + '\n';

    // Write back
    await env.VAULT.put(LOG_PATH, newContent);
  } catch (error) {
    // Log write failed - critical error but don't throw
    // The capture still succeeded, just audit failed
    console.error('Audit log write failed:', error.message);
  }
}
