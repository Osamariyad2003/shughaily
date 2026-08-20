/**
 * Shared BullMQ/ioredis connection options builder. Used by every queue in
 * the app (usage-logging, search-agent runs, ...) so connection parsing and
 * retry behavior stay consistent instead of being copy-pasted per queue.
 */
export function parseRedisConnection(url: string) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port || '6379', 10),
      ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
      ...(parsed.username && parsed.username !== 'default' ? { username: parsed.username } : {}),
      ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      // Bound retries so a dead Redis server doesn't spam the log
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times: number) => (times >= 5 ? null : Math.min(times * 500, 3_000)),
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}
