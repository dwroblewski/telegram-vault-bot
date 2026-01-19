/**
 * GitHub API service
 */

/**
 * Trigger GitHub Action to sync capture to vault repo
 */
export async function notifyGitHub(filename, env) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
    console.log('GitHub sync disabled: missing GITHUB_TOKEN or GITHUB_REPO');
    return;
  }

  const response = await fetch(
    `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'telegram-vault-bot',
      },
      body: JSON.stringify({
        event_type: 'telegram_capture',
        client_payload: { filename },
      }),
    }
  );

  if (response.status === 204) {
    console.log(`GitHub: triggered sync for ${filename}`);
  } else {
    const text = await response.text();
    throw new Error(`GitHub sync failed: ${response.status} - ${text.slice(0, 100)}`);
  }
}
