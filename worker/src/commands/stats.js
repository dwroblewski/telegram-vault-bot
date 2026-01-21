/**
 * /stats command - show vault statistics with freshness details
 */
import { sendTelegram } from '../services/telegram.js';

/**
 * Parse VAULT_META block from context file
 */
function parseVaultMeta(content) {
  const metaMatch = content.match(/<!-- VAULT_META\n([\s\S]*?)\n-->/);
  if (!metaMatch) return null;

  const meta = {};
  metaMatch[1].split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(': ');
    const value = valueParts.join(': '); // Handle values with colons (timestamps)
    if (key && value) {
      meta[key.trim()] = value.trim();
    }
  });
  return meta;
}

/**
 * Format time ago string
 */
function formatTimeAgo(isoDate) {
  if (!isoDate) return 'unknown';
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.round(ms / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export async function handleStatsCommand(env, chatId) {
  try {
    const contextFile = await env.VAULT.get('_vault_context.md');
    let statsText = '*📊 Vault Stats*\n\n';

    if (contextFile) {
      const content = await contextFile.text();
      const meta = parseVaultMeta(content);

      if (meta) {
        // Sync freshness
        const syncAge = formatTimeAgo(meta.synced);
        const staleWarning = syncAge.includes('d') ? ' ⚠️' : ' ✓';

        // Coverage info
        const coverage = meta.coverage_pct || '?';
        const included = meta.included || '?';
        const total = meta.total_queryable || '?';
        const excluded = meta.excluded || '0';

        // File freshness range
        const newestAge = meta.newest_file ? formatTimeAgo(meta.newest_file) : '?';
        const oldestAge = meta.oldest_included ? formatTimeAgo(meta.oldest_included) : '?';

        statsText += `🔄 *Sync*: ${syncAge}${staleWarning}\n`;
        statsText += `📦 *Size*: ${meta.size_kb || '?'}KB / ${meta.limit_kb || 1000}KB\n`;
        statsText += `📊 *Coverage*: ${coverage}% (${included}/${total})\n`;
        statsText += `📅 *Content*: ${newestAge} → ${oldestAge}\n`;
        if (parseInt(excluded) > 0) {
          statsText += `🚫 *Excluded*: ${excluded} oldest files\n`;
        }
        statsText += '\n';
      } else {
        // Fallback to old format (legacy support)
        const sizeKB = Math.round(content.length / 1024);
        const matches = content.match(/^## File: /gm);
        const fileCount = matches ? matches.length : 0;

        const syncMatch = content.match(/<!-- synced: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) -->/);
        let syncInfo = '';
        if (syncMatch) {
          const syncAge = Math.round((Date.now() - new Date(syncMatch[1]).getTime()) / 3600000);
          const staleWarning = syncAge > 24 ? ' ⚠️' : ' ✓';
          syncInfo = ` (${syncAge}h ago)${staleWarning}`;
        }

        statsText += `📁 *Context*: ${sizeKB}KB · ${fileCount} files${syncInfo}\n\n`;
      }
    } else {
      statsText += `❌ *Context*: Not synced\n\n`;
    }

    // Count inbox items
    const inbox = await env.VAULT.list({ prefix: '0-Inbox/', limit: 100 });
    const inboxCount = inbox.objects?.length || 0;

    statsText += `📬 *Inbox*: ${inboxCount} captures\n`;
    statsText += `🤖 *Model*: ${env.MODEL || 'gemini-2.5-flash'}`;

    await sendTelegram(env, chatId, statsText);
  } catch (error) {
    console.error('Stats error:', error);
    await sendTelegram(env, chatId, `❌ ${error.message}`);
  }
}
