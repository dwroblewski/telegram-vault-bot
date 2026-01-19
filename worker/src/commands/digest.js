/**
 * /digest command - trigger daily digest workflow
 */
import { sendTelegram } from '../services/telegram.js';

export async function handleDigestCommand(env, chatId, type) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    await sendTelegram(env, chatId, '❌ GitHub sync not configured');
    return;
  }

  try {
    await sendTelegram(env, chatId, `⏳ Triggering ${type} digest...`);

    const response = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/daily-digest.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'User-Agent': 'telegram-vault-bot',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { digest_type: type },
        }),
      }
    );

    if (response.status === 204) {
      await sendTelegram(env, chatId, `✅ ${type} digest triggered - check Telegram in ~10s`);
    } else {
      const text = await response.text();
      console.log(`Digest trigger failed: ${response.status} - ${text}`);
      await sendTelegram(env, chatId, `❌ Failed: ${response.status}`);
    }
  } catch (error) {
    console.error('Digest trigger error:', error);
    await sendTelegram(env, chatId, `❌ ${error.message}`);
  }
}
