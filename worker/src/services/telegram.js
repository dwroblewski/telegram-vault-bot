/**
 * Telegram API service
 */

export async function sendTelegram(env, chatId, text, options = {}) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
      ...options,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`sendTelegram failed: ${response.status} - ${error}`);
  }

  return response.ok;
}

export async function reactToMessage(env, chatId, messageId, emoji) {
  // Map common emojis to Telegram-supported reaction emojis
  const emojiMap = {
    '✅': '👍',
    '❌': '👎',
  };
  const mappedEmoji = emojiMap[emoji] || emoji;

  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setMessageReaction`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: mappedEmoji }],
    }),
  });

  if (!response.ok) {
    console.error('Reaction failed:', await response.text());
  }
}

export async function sendChatAction(env, chatId, action) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendChatAction`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      action: action,
    }),
  });
}

/**
 * Push critical errors to Telegram (fire once, don't spam)
 * Only alerts on infrastructure/dependency failures, not user errors
 */
export async function alertOnError(env, context, error) {
  // Only alert on critical errors, not user errors
  const criticalPatterns = ['R2', 'Gemini API', 'TIMEOUT', 'Worker error', 'fetch failed', 'GitHub sync'];
  const isCritical = criticalPatterns.some(p => error.message?.includes(p));

  if (!isCritical || !env.ALLOWED_USER_ID) return;

  const msg = `🚨 Worker error\n\nPath: ${context}\nError: ${error.message}`;

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.ALLOWED_USER_ID,
        text: msg.slice(0, 500),
      }),
    });
  } catch (e) {
    console.error('Alert failed:', e);
  }
}
