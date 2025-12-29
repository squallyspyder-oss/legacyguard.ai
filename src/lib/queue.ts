import Redis from 'ioredis';
import { getRedisUrl } from './config';

let redisClient: Redis | null = null;

// ============ Configuration ============

export type RetryConfig = {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
};

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

// DLQ stream for failed tasks
export const DLQ_STREAM = 'agents-dlq';

// ============ Connection ============

export function connectRedis(url?: string) {
  if (redisClient) return redisClient;
  let redisUrl = url || getRedisUrl();
  if (!redisUrl) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Redis URL não configurado. Defina REDIS_URL ou REDIS_TLS_URL.');
    }
    redisUrl = 'redis://127.0.0.1:6379';
  }

  // Sanitize incoming URL: remove quotes/whitespace and normalize protocol
  try {
    redisUrl = redisUrl.trim();
    if ((redisUrl.startsWith('"') && redisUrl.endsWith('"')) || (redisUrl.startsWith("'") && redisUrl.endsWith("'"))) {
      redisUrl = redisUrl.slice(1, -1);
    }
    redisUrl = redisUrl.replace(/\s+/g, '');
    if (redisUrl.startsWith('redis:/') && !redisUrl.startsWith('redis://')) {
      redisUrl = redisUrl.replace('redis:/', 'redis://');
    }
  } catch (e) {
    console.warn('[REDIS] Failed to sanitize REDIS_URL, using raw value');
  }

  redisClient = new Redis(redisUrl);
  redisClient.on('error', (err) => console.error('Redis error', err));
  return redisClient;
}

export function disconnectRedis() {
  if (redisClient) {
    redisClient.disconnect();
    redisClient = null;
  }
}

// ============ Stream operations ============

/** Ensure a consumer group exists for a stream. */
export async function ensureGroup(stream: string, group: string) {
  const r = connectRedis();
  try {
    await r.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
  } catch (e: any) {
    // ignore if group exists
    if (!/BUSYGROUP/.test(e.message || '')) {
      throw e;
    }
  }
}

export async function enqueueTask(stream: string, data: Record<string, any>) {
  const r = connectRedis();
  const flat: string[] = [];
  for (const k of Object.keys(data)) {
    flat.push(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]));
  }
  return r.xadd(stream, '*', ...flat);
}

export async function readGroup(stream: string, group: string, consumer: string, count = 1, block = 5000): Promise<[string, [string, string[]][]][] | null> {
  const r = connectRedis();
  // XREADGROUP GROUP <group> <consumer> [COUNT <count>] [BLOCK <ms>] STREAMS <stream> >
  const res = await (r as any).xreadgroup('GROUP', group, consumer, 'COUNT', count, 'BLOCK', block, 'STREAMS', stream, '>');
  return res as [string, [string, string[]][]][] | null; // raw response to be parsed by caller
}

export async function ack(stream: string, group: string, id: string) {
  const r = connectRedis();
  return r.xack(stream, group, id);
}

// ============ Retry & DLQ ============

/** Calculate delay with exponential backoff + jitter */
export function calculateBackoff(attempt: number, config: RetryConfig = DEFAULT_RETRY_CONFIG): number {
  const delay = Math.min(
    config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs
  );
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.floor(delay + jitter);
}

/** Get retry metadata from task data */
export function getRetryInfo(data: Record<string, any>): { attempt: number; maxRetries: number } {
  return {
    attempt: typeof data._retryAttempt === 'number' ? data._retryAttempt : 0,
    maxRetries: typeof data._maxRetries === 'number' ? data._maxRetries : DEFAULT_RETRY_CONFIG.maxRetries,
  };
}

/** Requeue a task for retry with exponential backoff */
export async function requeueForRetry(
  stream: string,
  data: Record<string, any>,
  error: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ requeued: boolean; attempt: number; nextDelayMs?: number }> {
  const { attempt, maxRetries } = getRetryInfo(data);
  const nextAttempt = attempt + 1;

  if (nextAttempt > maxRetries) {
    // Max retries exceeded, send to DLQ
    await sendToDLQ(data, error, nextAttempt);
    return { requeued: false, attempt: nextAttempt };
  }

  const delayMs = calculateBackoff(attempt, config);

  // Schedule retry (using delayed task pattern)
  const retryData = {
    ...data,
    _retryAttempt: nextAttempt,
    _maxRetries: maxRetries,
    _lastError: error,
    _retryScheduledAt: new Date().toISOString(),
    _retryDelayMs: delayMs,
  };

  // For simplicity, we add directly to stream. In production, use Redis sorted set for delayed tasks.
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  await enqueueTask(stream, retryData);

  console.log(`🔄 Task requeued for retry ${nextAttempt}/${maxRetries} after ${delayMs}ms`);
  return { requeued: true, attempt: nextAttempt, nextDelayMs: delayMs };
}

/** Send failed task to Dead Letter Queue */
export async function sendToDLQ(
  data: Record<string, any>,
  error: string,
  finalAttempt: number
): Promise<string | null> {
  const dlqEntry = {
    ...data,
    _dlqReason: error,
    _finalAttempt: finalAttempt,
    _sentToDLQAt: new Date().toISOString(),
    _originalTaskId: data.taskId || 'unknown',
  };

  const id = await enqueueTask(DLQ_STREAM, dlqEntry);
  console.error(`💀 Task sent to DLQ after ${finalAttempt} attempts: ${error}`);
  return String(id);
}

/** Read pending (unacknowledged) messages for recovery */
export async function readPending(
  stream: string,
  group: string,
  consumer: string,
  count = 10,
  minIdleMs = 60000
): Promise<Array<{ id: string; data: Record<string, any>; idleMs: number; deliveryCount: number }>> {
  const r = connectRedis();

  // XPENDING stream group - + count consumer
  const pending = await r.xpending(stream, group, '-', '+', count, consumer);

  if (!Array.isArray(pending) || pending.length === 0) {
    return [];
  }

  const results: Array<{ id: string; data: Record<string, any>; idleMs: number; deliveryCount: number }> = [];

  for (const entry of pending) {
    const [id, , idleMs, deliveryCount] = entry as [string, string, number, number];

    if (idleMs < minIdleMs) continue;

    // Claim the message
    const claimed = await r.xclaim(stream, group, consumer, minIdleMs, id);

    if (claimed && claimed.length > 0) {
      const [, pairs] = claimed[0] as [string, string[]];
      const data: Record<string, any> = {};

      for (let i = 0; i < pairs.length; i += 2) {
        const key = pairs[i];
        const val = pairs[i + 1];
        try {
          data[key] = JSON.parse(val);
        } catch {
          data[key] = val;
        }
      }

      results.push({ id, data, idleMs, deliveryCount });
    }
  }

  return results;
}

/** Get DLQ entries for inspection/replay */
export async function getDLQEntries(count = 100): Promise<Array<{ id: string; data: Record<string, any> }>> {
  const r = connectRedis();
  const entries = await r.xrange(DLQ_STREAM, '-', '+', 'COUNT', count);

  return entries.map(([id, pairs]) => {
    const data: Record<string, any> = {};
    for (let i = 0; i < pairs.length; i += 2) {
      try {
        data[pairs[i]] = JSON.parse(pairs[i + 1]);
      } catch {
        data[pairs[i]] = pairs[i + 1];
      }
    }
    return { id, data };
  });
}

/** Replay a DLQ entry back to the main queue */
export async function replayFromDLQ(dlqId: string, targetStream: string): Promise<boolean> {
  const r = connectRedis();
  const entries = await r.xrange(DLQ_STREAM, dlqId, dlqId);

  if (!entries || entries.length === 0) return false;

  const [, pairs] = entries[0];
  const data: Record<string, any> = {};

  for (let i = 0; i < pairs.length; i += 2) {
    try {
      data[pairs[i]] = JSON.parse(pairs[i + 1]);
    } catch {
      data[pairs[i]] = pairs[i + 1];
    }
  }

  // Reset retry counters
  delete data._retryAttempt;
  delete data._dlqReason;
  delete data._finalAttempt;
  delete data._sentToDLQAt;

  await enqueueTask(targetStream, data);
  await r.xdel(DLQ_STREAM, dlqId);

  console.log(`♻️ Replayed DLQ entry ${dlqId} to ${targetStream}`);
  return true;
}
