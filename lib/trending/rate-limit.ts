const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestsByIp = new Map<string, { count: number; expiresAt: number }>();

export function consumeShuffleRateLimit(ip: string, now = Date.now()): boolean {
  const current = requestsByIp.get(ip);
  if (!current || current.expiresAt <= now) {
    requestsByIp.set(ip, { count: 1, expiresAt: now + WINDOW_MS });
    if (requestsByIp.size > 1_000) {
      for (const [key, value] of requestsByIp) if (value.expiresAt <= now) requestsByIp.delete(key);
    }
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

export function clearShuffleRateLimit() {
  requestsByIp.clear();
}
