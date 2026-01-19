/**
 * Telegram Brain v2 - Serverless Worker
 *
 * Endpoints:
 * - POST /webhook - Telegram webhook handler
 * - GET /health - Health check with vault verification
 * - POST /test - Smoke test (no persistence)
 * - GET /captures/export - Export all captures as JSON
 */

import { sendTelegram, alertOnError, isValidTelegramIP, checkRateLimit } from './services/index.js';
import {
  handleHelpCommand,
  handleStatsCommand,
  handleDigestCommand,
  handleRecentCommand,
  handleAskCommand,
  handleCapture,
} from './commands/index.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // Health check - deep verification
      if (url.pathname === '/health') {
        const checks = {
          gemini: !!env.GEMINI_API_KEY,
          telegram: !!env.TELEGRAM_BOT_TOKEN,
        };

        // Check vault context file exists and has content
        try {
          const contextFile = await env.VAULT.get('_vault_context.md');
          if (contextFile) {
            const content = await contextFile.text();
            checks.vault = {
              ok: content.length > 1000,
              sizeKB: Math.round(content.length / 1024),
            };
          } else {
            checks.vault = { ok: false, error: 'No context file' };
          }
        } catch (e) {
          checks.vault = { ok: false, error: e.message };
        }

        const allOk = checks.gemini && checks.telegram && checks.vault?.ok;

        return jsonResponse({
          status: allOk ? 'healthy' : 'degraded',
          checks,
          timestamp: new Date().toISOString(),
        });
      }

      // Telegram webhook
      if (url.pathname === '/webhook' && request.method === 'POST') {
        // Validate request comes from Telegram IP ranges
        const clientIP = request.headers.get('CF-Connecting-IP');
        if (!isValidTelegramIP(clientIP)) {
          console.log(`Webhook rejected: invalid IP ${clientIP}`);
          return jsonResponse({ error: 'Forbidden' }, 403);
        }

        // Validate Telegram webhook secret (required for security)
        if (env.WEBHOOK_SECRET) {
          const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
          if (secretHeader !== env.WEBHOOK_SECRET) {
            console.log('Webhook auth failed: invalid or missing secret token');
            return jsonResponse({ error: 'Unauthorized' }, 401);
          }
        }

        const update = await request.json();

        // Rate limiting per chat
        const chatId = update.message?.chat?.id;
        if (chatId) {
          const allowed = await checkRateLimit(chatId);
          if (!allowed) {
            console.log(`Rate limited: chatId=${chatId}`);
            ctx.waitUntil(sendTelegram(env, chatId, '⚠️ Rate limited. Please wait a minute.'));
            return jsonResponse({ ok: true });
          }
        }

        ctx.waitUntil(handleTelegramUpdate(update, env));
        return jsonResponse({ ok: true });
      }

      // Smoke test endpoint (no persistence, for deploy verification)
      if (url.pathname === '/test' && request.method === 'POST') {
        return jsonResponse({
          ok: true,
          message: 'Test endpoint reached',
          timestamp: new Date().toISOString(),
          checks: {
            gemini: !!env.GEMINI_API_KEY,
            telegram: !!env.TELEGRAM_BOT_TOKEN,
            vault: !!env.VAULT,
          },
        });
      }

      // Export captures endpoint - list all telegram captures in R2
      // Requires API key authentication via Authorization header
      if (url.pathname === '/captures/export') {
        const authHeader = request.headers.get('Authorization');
        const expectedToken = `Bearer ${env.TELEGRAM_BOT_TOKEN}`;

        if (!authHeader || authHeader !== expectedToken) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }

        const captures = await exportCaptures(env);
        return jsonResponse(captures);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Worker error:', error);
      // Push critical errors to Telegram (non-blocking)
      ctx.waitUntil(alertOnError(env, url.pathname, error));
      return jsonResponse({ error: error.message }, 500);
    }
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Handle incoming Telegram update
 */
async function handleTelegramUpdate(update, env) {
  console.log('Received update:', JSON.stringify(update).substring(0, 200));

  const message = update.message;
  if (!message || !message.text) {
    console.log('No message or text, skipping');
    return;
  }

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text;

  // Auth check - only allow configured user
  if (env.ALLOWED_USER_ID && userId.toString() !== env.ALLOWED_USER_ID) {
    await sendTelegram(env, chatId, '⛔ Unauthorized');
    return;
  }

  // Command routing
  if (text.startsWith('/ask ')) {
    const query = text.slice(5).trim();
    await handleAskCommand(env, chatId, message.message_id, query);
  } else if (text === '/help' || text === '/start') {
    await handleHelpCommand(env, chatId);
  } else if (text === '/recent') {
    await handleRecentCommand(env, chatId);
  } else if (text === '/stats') {
    await handleStatsCommand(env, chatId);
  } else if (text === '/health') {
    await sendTelegram(env, chatId, '✅ Bot is running');
  } else if (text === '/digest' || text === '/digest morning' || text === '/digest evening') {
    const type = text.includes('evening') ? 'evening' : 'morning';
    await handleDigestCommand(env, chatId, type);
  } else if (text === '/inbox') {
    await handleAskCommand(env, chatId, message.message_id, 'what needs attention in inbox? prioritize by age and importance');
  } else if (text === '/summary') {
    await handleAskCommand(env, chatId, message.message_id, 'summarize today\'s captures concisely');
  } else if (text.startsWith('/')) {
    // Unknown command
    await sendTelegram(env, chatId, `Unknown command. Try /help`);
  } else {
    // Default: capture to inbox
    await handleCapture(env, chatId, message.message_id, text);
  }
}

/**
 * Export all Telegram captures from R2
 * Returns JSON with all capture files and their content
 */
async function exportCaptures(env) {
  try {
    // List all telegram captures in inbox
    const listed = await env.VAULT.list({ prefix: '0-Inbox/telegram-', limit: 1000 });

    if (!listed.objects || listed.objects.length === 0) {
      return { captures: [], count: 0 };
    }

    // Get content of each capture
    const captures = [];
    for (const obj of listed.objects) {
      const file = await env.VAULT.get(obj.key);
      if (file) {
        const content = await file.text();
        captures.push({
          key: obj.key,
          filename: obj.key.split('/').pop(),
          uploaded: obj.uploaded,
          content: content,
        });
      }
    }

    return {
      captures: captures,
      count: captures.length,
      exported_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Export error:', error);
    return { error: error.message };
  }
}
