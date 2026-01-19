/**
 * /recent command - show recent inbox captures
 */
import { sendTelegram } from '../services/telegram.js';

export async function handleRecentCommand(env, chatId) {
  try {
    // List objects in 0-Inbox/ prefix
    const listed = await env.VAULT.list({ prefix: '0-Inbox/', limit: 10 });

    if (!listed.objects || listed.objects.length === 0) {
      await sendTelegram(env, chatId, '_📭 Inbox empty_');
      return;
    }

    // Sort by uploaded time (most recent first) and take 5
    const sorted = listed.objects
      .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded))
      .slice(0, 5);

    // Build response
    let response = '*📬 Recent Captures*\n\n';

    for (const obj of sorted) {
      // Get first line of content as preview
      const file = await env.VAULT.get(obj.key);
      if (file) {
        const content = await file.text();
        // Skip tags, get first meaningful line
        const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
        const preview = lines[0]?.substring(0, 60) || '(empty)';
        const truncated = preview.length >= 60 ? preview + '...' : preview;

        // Parse timestamp from filename: telegram-2026-01-14T21-21-46-819Z.md
        const match = obj.key.match(/telegram-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
        const dateStr = match ? `${match[1]} ${match[2]}:${match[3]}` : 'unknown';

        response += `• _${dateStr}_\n${truncated}\n\n`;
      }
    }

    response += `_${listed.objects.length} total in inbox_`;
    await sendTelegram(env, chatId, response);
  } catch (error) {
    console.error('Recent error:', error);
    await sendTelegram(env, chatId, `❌ ${error.message}`);
  }
}
