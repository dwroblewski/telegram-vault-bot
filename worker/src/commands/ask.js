/**
 * /ask command - query vault with Gemini
 */
import { sendTelegram, sendChatAction } from '../services/telegram.js';
import { loadVaultFromR2 } from '../services/vault.js';
import { queryGemini } from '../services/gemini.js';

export async function handleAskCommand(env, chatId, messageId, query) {
  const TIMEOUT_MS = 25000; // 25s timeout (CF limit is 30s)
  const startTime = Date.now();

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS);
  });

  try {
    // Send typing indicator
    await sendChatAction(env, chatId, 'typing');

    // Race against timeout
    const { answer, vaultSizeKB, syncedAt } = await Promise.race([
      (async () => {
        const { content, sizeKB, syncedAt } = await loadVaultFromR2(env);
        if (!content) {
          throw new Error('Vault empty - run sync first');
        }
        const answer = await queryGemini(env, content, query);
        return { answer, vaultSizeKB: sizeKB, syncedAt };
      })(),
      timeoutPromise,
    ]);

    // Add minimal footer with response time, vault size, and staleness warning
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    let staleWarning = '';
    if (syncedAt) {
      const syncAgeHours = Math.round((Date.now() - syncedAt.getTime()) / 3600000);
      if (syncAgeHours > 24) {
        staleWarning = ` ⚠️ ${syncAgeHours}h stale`;
      }
    }
    const response = `${answer}\n\n_⚡ ${elapsed}s · ${vaultSizeKB}KB vault${staleWarning}_`;

    await sendTelegram(env, chatId, response, { reply_to_message_id: messageId });
  } catch (error) {
    console.error('Ask error:', error);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (error.message === 'TIMEOUT') {
      await sendTelegram(env, chatId, `⏱️ Query timed out after ${elapsed}s. Try a simpler question.`);
    } else {
      await sendTelegram(env, chatId, `❌ ${error.message}\n\n_⚡ ${elapsed}s_`);
    }
  }
}
