/**
 * /help command - list available commands
 */
import { sendTelegram } from '../services/telegram.js';

export async function handleHelpCommand(env, chatId) {
  const help = `*Second Brain Bot*

📝 *Capture* - Just send any text
/ask <query> - Query your vault
/inbox - What needs attention in inbox
/summary - Summarize today's captures
/digest - Trigger morning digest
/digest evening - Trigger evening digest
/recent - Show recent captures
/stats - Vault statistics
/help - This message

_Tip: Send links, ideas, or notes - they're saved to your inbox for processing._`;

  await sendTelegram(env, chatId, help);
}
