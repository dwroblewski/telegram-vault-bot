/**
 * Capture command - save message to R2 inbox
 */
import { sendTelegram, reactToMessage, alertOnError } from '../services/telegram.js';
import { notifyGitHub } from '../services/github.js';

export async function handleCapture(env, chatId, messageId, text) {
  console.log(`Capture: chatId=${chatId}, messageId=${messageId}, text=${text.substring(0, 50)}`);
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `telegram-${timestamp}.md`;
    const r2Key = `0-Inbox/${filename}`;
    console.log(`Writing to R2: ${r2Key}`);

    const content = `#telegram #capture

${text}

---
*Captured via Telegram: ${new Date().toISOString()}*
`;

    await env.VAULT.put(r2Key, content, {
      httpMetadata: { contentType: 'text/markdown' },
    });

    // Trigger GitHub sync (fire-and-forget, alerts on failure)
    notifyGitHub(filename, env, chatId).catch(e => {
      console.log(`GitHub notify failed: ${e.message}`);
      alertOnError(env, 'notifyGitHub', e);
    });

    // Confirm capture with reaction (thumbs up) and silent message
    await reactToMessage(env, chatId, messageId, '👍');
  } catch (error) {
    console.error('Capture error:', error);
    await sendTelegram(env, chatId, `❌ Capture failed: ${error.message}`);
  }
}
