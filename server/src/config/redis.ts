import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env';
import { createLogger } from '../utils/logger';

const log = createLogger('cache');

/**
 * Optional Redis cache layer.
 *
 * Financial operations never depend on the cache — a cache failure degrades
 * performance only. Every helper is a no-op when Redis is unavailable.
 */

let client: RedisClientType | null = null;
let connected = false;
let lastError: string | null = null;
let connectingPromise: Promise<void> | null = null;

/**
 * The cache is active whenever `REDIS_URL` is set.
 *
 * There is deliberately NO `NODE_ENV === 'test'` opt-out here. A blanket
 * test-environment override made the whole cache layer untestable — the Redis
 * integration could only ever be asserted as "disabled", so the 5-minute TTL,
 * the HIT/MISS header, prefix invalidation and per-viewer cache scoping were all
 * unverified.
 *
 * Hermeticity is achieved by the harness instead: `test/helpers/harness.ts`
 * explicitly sets `REDIS_URL = ''` before importing any app module, and
 * `dotenv` never overwrites an already-set variable, so a developer's real
 * `.env` cannot leak into the default suite. `test/redis.cache.test.ts` sets
 * `REDIS_URL` deliberately to exercise the cache for real.
 */
const isEnabled = (): boolean => env.redisUrl.length > 0;

/**
 * Hard ceiling on any single cache operation.
 *
 * node-redis v4+ does not reject commands while it is reconnecting — it queues
 * them. That means a mid-flight Redis outage (server restarted, network blip)
 * would make `await client.get(key)` hang indefinitely rather than throw, and
 * every request that touches discovery would hang with it. Wrapping each call
 * in a timeout turns that into a fast cache miss, so the API keeps serving from
 * MongoDB exactly as the specification requires ("must still provide a clean
 * development mode when Redis is unavailable").
 */
const CACHE_COMMAND_TIMEOUT_MS = 750;

const withTimeout = async <T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          lastError = `timeout after ${CACHE_COMMAND_TIMEOUT_MS}ms (${label})`;
          resolve(fallback);
        }, CACHE_COMMAND_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'unknown';
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const initRedis = async (): Promise<void> => {
  if (!isEnabled()) {
    log.info('REDIS_URL not set — running without cache');
    return;
  }
  if (connected || connectingPromise) return connectingPromise ?? undefined;

  connectingPromise = (async () => {
    try {
      client = createClient({ url: env.redisUrl });
      client.on('error', (err) => {
        lastError = err.message;
        connected = false;
      });
      client.on('ready', () => {
        connected = true;
        log.info('redis connected');
      });
      client.on('end', () => {
        connected = false;
      });
      await client.connect();
      connected = true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'unknown';
      connected = false;
      log.warn(`redis unavailable (${lastError}) — continuing without cache`);
      client = null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
};

export const isCacheAvailable = (): boolean => connected && client !== null;

export const cacheStatus = () => ({
  enabled: isEnabled(),
  connected,
  lastError,
});

const safeGet = async (key: string): Promise<string | null> => {
  if (!isCacheAvailable() || !client) return null;
  return withTimeout(`GET ${key}`, () => client!.get(key), null);
};

const safeSet = async (key: string, value: string, ttlSeconds: number): Promise<void> => {
  if (!isCacheAvailable() || !client) return;
  await withTimeout(`SET ${key}`, () => client!.set(key, value, { EX: ttlSeconds }), undefined);
};

export const cacheGet = <T>(key: string): Promise<T | null> => {
  return (async () => {
    const raw = await safeGet(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  })();
};

export const cacheSet = (key: string, value: unknown, ttlSeconds: number): Promise<void> =>
  safeSet(key, JSON.stringify(value), ttlSeconds);

export const cacheDel = async (...keys: string[]): Promise<void> => {
  if (!isCacheAvailable() || !client || keys.length === 0) return;
  await withTimeout('DEL', () => client!.del(keys), undefined);
};

/**
 * Deletes every cache entry whose key matches a prefix.
 * Uses SCAN so a large keyspace is never blocked.
 */
export const cacheDelByPrefix = async (prefix: string): Promise<number> => {
  if (!isCacheAvailable() || !client) return 0;
  return withTimeout(
    `SCAN ${prefix}*`,
    async () => {
      let removed = 0;
      const iterator = client!.scanIterator({ MATCH: `${prefix}*`, COUNT: 200 });
      const batch: string[] = [];
      for await (const key of iterator) {
        batch.push(key as string);
        if (batch.length >= 200) {
          await client!.del(batch);
          removed += batch.length;
          batch.length = 0;
        }
      }
      if (batch.length) {
        await client!.del(batch);
        removed += batch.length;
      }
      return removed;
    },
    0,
  );
};

/**
 * Root of every Redis key this application owns.
 *
 * Exported so `cacheInvalidation` can build the same prefix that `buildKey`
 * writes. Keeping one definition is what stops a delete from silently missing
 * every write.
 */
export const CACHE_KEY_ROOT = 'flattown';

/** Stable cache key builder for the discovery endpoint. */
export const buildKey = (namespace: string, parts: Record<string, unknown>): string => {
  const stable = Object.keys(parts)
    .sort()
    .filter((k) => parts[k] !== undefined && parts[k] !== null && parts[k] !== '')
    .map((k) => `${k}=${String(parts[k])}`)
    .join('&');
  return `${CACHE_KEY_ROOT}:${namespace}:${stable}`;
};

export const disconnectRedis = async (): Promise<void> => {
  if (client && connected) {
    await client.quit().catch(() => undefined);
  }
  connected = false;
  client = null;
};