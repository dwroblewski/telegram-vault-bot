/**
 * Vault/R2 service
 */

/**
 * Load pre-aggregated vault context from R2 (single file, fast)
 * Returns { content, sizeKB, syncedAt } or { content: null, sizeKB: 0, syncedAt: null }
 */
export async function loadVaultFromR2(env) {
  console.log('Loading vault context from R2...');

  try {
    // Load single pre-aggregated context file
    const contextFile = await env.VAULT.get('_vault_context.md');

    if (!contextFile) {
      console.error('No _vault_context.md found - run sync-vault.sh first');
      return { content: null, sizeKB: 0, syncedAt: null };
    }

    const content = await contextFile.text();
    const sizeKB = Math.round(content.length / 1024);

    // Parse sync timestamp for staleness detection
    const syncMatch = content.match(/<!-- synced: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z) -->/);
    const syncedAt = syncMatch ? new Date(syncMatch[1]) : null;

    console.log(`Loaded vault context (${sizeKB}KB)`);

    return { content, sizeKB, syncedAt };
  } catch (error) {
    console.error('Failed to load vault context:', error);
    return { content: null, sizeKB: 0, syncedAt: null };
  }
}
