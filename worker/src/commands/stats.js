/**
 * /stats command - show vault statistics
 */
import { sendTelegram } from '../services/telegram.js';

export async function handleStatsCommand(env, chatId) {
  try {
    // Get vault context size
    const contextFile = await env.VAULT.get('_vault_context.md');
    let vaultInfo = 'Not synced';
    let fileCount = 0;

    if (contextFile) {
      const content = await contextFile.text();
      const sizeKB = Math.round(content.length / 1024);

      // Count files from context (each file starts with "## File: ")
      const matches = content.match(/^## File: /gm);
      fileCount = matches ? matches.length : 0;

      // Parse sync timestamp for staleness indicator
      const syncMatch = content.match(/<!-- synced: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) -->/);
      let syncInfo = '';
      if (syncMatch) {
        const syncAge = Math.round((Date.now() - new Date(syncMatch[1]).getTime()) / 3600000);
        const staleWarning = syncAge > 24 ? ' ⚠️' : ' ✓';
        syncInfo = ` (${syncAge}h ago)${staleWarning}`;
      }

      vaultInfo = `${sizeKB}KB · ${fileCount} files${syncInfo}`;
    }

    // Count inbox items
    const inbox = await env.VAULT.list({ prefix: '0-Inbox/', limit: 100 });
    const inboxCount = inbox.objects?.length || 0;

    const stats = `*📊 Vault Stats*

📁 Context: ${vaultInfo}
📬 Inbox: ${inboxCount} captures
🤖 Model: ${env.MODEL || 'gemini-2.5-flash-lite'}

_Run sync-vault.sh to update context_`;

    await sendTelegram(env, chatId, stats);
  } catch (error) {
    console.error('Stats error:', error);
    await sendTelegram(env, chatId, `❌ ${error.message}`);
  }
}
