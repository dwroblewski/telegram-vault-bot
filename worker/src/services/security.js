/**
 * Security services - IP validation, rate limiting
 */

// Telegram webhook IP ranges (CIDR)
// https://core.telegram.org/bots/webhooks#the-short-version
const TELEGRAM_IP_RANGES = [
  { start: ipToInt('149.154.160.0'), end: ipToInt('149.154.175.255') }, // 149.154.160.0/20
  { start: ipToInt('91.108.4.0'), end: ipToInt('91.108.7.255') },       // 91.108.4.0/22
];

/**
 * Convert IP address to integer for range comparison
 */
export function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Check if IP is from Telegram's webhook IP ranges
 */
export function isValidTelegramIP(ip) {
  if (!ip) return false;
  const ipInt = ipToInt(ip);
  return TELEGRAM_IP_RANGES.some(range => ipInt >= range.start && ipInt <= range.end);
}

// Rate limiting configuration
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60000; // 1 minute in ms

/**
 * Check rate limit for a chat ID using Cloudflare cache API
 * Returns true if under limit, false if rate limited
 */
export async function checkRateLimit(chatId) {
  const cache = caches.default;
  const key = new Request(`https://rate-limit/${chatId}`);

  const cached = await cache.match(key);
  let count = 1;

  if (cached) {
    const data = await cached.json();
    count = data.count + 1;
  }

  // Store updated count
  const response = new Response(JSON.stringify({ count }), {
    headers: { 'Cache-Control': `max-age=${Math.ceil(RATE_WINDOW / 1000)}` }
  });
  await cache.put(key, response);

  return count <= RATE_LIMIT;
}
