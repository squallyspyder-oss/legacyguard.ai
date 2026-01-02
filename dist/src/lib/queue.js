"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DLQ_STREAM = exports.DEFAULT_RETRY_CONFIG = void 0;
exports.connectRedis = connectRedis;
exports.disconnectRedis = disconnectRedis;
exports.ensureGroup = ensureGroup;
exports.enqueueTask = enqueueTask;
exports.readGroup = readGroup;
exports.ack = ack;
exports.calculateBackoff = calculateBackoff;
exports.getRetryInfo = getRetryInfo;
exports.requeueForRetry = requeueForRetry;
exports.sendToDLQ = sendToDLQ;
exports.readPending = readPending;
exports.getDLQEntries = getDLQEntries;
exports.replayFromDLQ = replayFromDLQ;
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("./config");
let redisClient = null;
exports.DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};
// DLQ stream for failed tasks
exports.DLQ_STREAM = 'agents-dlq';
// ============ Connection ============
function connectRedis(url) {
    if (redisClient)
        return redisClient;
    let redisUrl = url || (0, config_1.getRedisUrl)();
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
    }
    catch (e) {
        console.warn('[REDIS] Failed to sanitize REDIS_URL, using raw value');
    }
    redisClient = new ioredis_1.default(redisUrl);
    redisClient.on('error', (err) => console.error('Redis error', err));
    return redisClient;
}
function disconnectRedis() {
    if (redisClient) {
        redisClient.disconnect();
        redisClient = null;
    }
}
// ============ Stream operations ============
/** Ensure a consumer group exists for a stream. */
async function ensureGroup(stream, group) {
    const r = connectRedis();
    try {
        await r.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
    }
    catch (e) {
        // ignore if group exists
        if (!/BUSYGROUP/.test(e.message || '')) {
            throw e;
        }
    }
}
async function enqueueTask(stream, data) {
    const r = connectRedis();
    const flat = [];
    for (const k of Object.keys(data)) {
        flat.push(k, typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]));
    }
    return r.xadd(stream, '*', ...flat);
}
async function readGroup(stream, group, consumer, count = 1, block = 5000) {
    const r = connectRedis();
    // XREADGROUP GROUP <group> <consumer> [COUNT <count>] [BLOCK <ms>] STREAMS <stream> >
    const res = await r.xreadgroup('GROUP', group, consumer, 'COUNT', count, 'BLOCK', block, 'STREAMS', stream, '>');
    return res; // raw response to be parsed by caller
}
async function ack(stream, group, id) {
    const r = connectRedis();
    return r.xack(stream, group, id);
}
// ============ Retry & DLQ ============
/** Calculate delay with exponential backoff + jitter */
function calculateBackoff(attempt, config = exports.DEFAULT_RETRY_CONFIG) {
    const delay = Math.min(config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt), config.maxDelayMs);
    // Add jitter (±20%)
    const jitter = delay * 0.2 * (Math.random() - 0.5);
    return Math.floor(delay + jitter);
}
/** Get retry metadata from task data */
function getRetryInfo(data) {
    return {
        attempt: typeof data._retryAttempt === 'number' ? data._retryAttempt : 0,
        maxRetries: typeof data._maxRetries === 'number' ? data._maxRetries : exports.DEFAULT_RETRY_CONFIG.maxRetries,
    };
}
/** Requeue a task for retry with exponential backoff */
async function requeueForRetry(stream, data, error, config = exports.DEFAULT_RETRY_CONFIG) {
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
async function sendToDLQ(data, error, finalAttempt) {
    const dlqEntry = {
        ...data,
        _dlqReason: error,
        _finalAttempt: finalAttempt,
        _sentToDLQAt: new Date().toISOString(),
        _originalTaskId: data.taskId || 'unknown',
    };
    const id = await enqueueTask(exports.DLQ_STREAM, dlqEntry);
    console.error(`💀 Task sent to DLQ after ${finalAttempt} attempts: ${error}`);
    return String(id);
}
/** Read pending (unacknowledged) messages for recovery */
async function readPending(stream, group, consumer, count = 10, minIdleMs = 60000) {
    const r = connectRedis();
    // XPENDING stream group - + count consumer
    const pending = await r.xpending(stream, group, '-', '+', count, consumer);
    if (!Array.isArray(pending) || pending.length === 0) {
        return [];
    }
    const results = [];
    for (const entry of pending) {
        const [id, , idleMs, deliveryCount] = entry;
        if (idleMs < minIdleMs)
            continue;
        // Claim the message
        const claimed = await r.xclaim(stream, group, consumer, minIdleMs, id);
        if (claimed && claimed.length > 0) {
            const [, pairs] = claimed[0];
            const data = {};
            for (let i = 0; i < pairs.length; i += 2) {
                const key = pairs[i];
                const val = pairs[i + 1];
                try {
                    data[key] = JSON.parse(val);
                }
                catch {
                    data[key] = val;
                }
            }
            results.push({ id, data, idleMs, deliveryCount });
        }
    }
    return results;
}
/** Get DLQ entries for inspection/replay */
async function getDLQEntries(count = 100) {
    const r = connectRedis();
    const entries = await r.xrange(exports.DLQ_STREAM, '-', '+', 'COUNT', count);
    return entries.map(([id, pairs]) => {
        const data = {};
        for (let i = 0; i < pairs.length; i += 2) {
            try {
                data[pairs[i]] = JSON.parse(pairs[i + 1]);
            }
            catch {
                data[pairs[i]] = pairs[i + 1];
            }
        }
        return { id, data };
    });
}
/** Replay a DLQ entry back to the main queue */
async function replayFromDLQ(dlqId, targetStream) {
    const r = connectRedis();
    const entries = await r.xrange(exports.DLQ_STREAM, dlqId, dlqId);
    if (!entries || entries.length === 0)
        return false;
    const [, pairs] = entries[0];
    const data = {};
    for (let i = 0; i < pairs.length; i += 2) {
        try {
            data[pairs[i]] = JSON.parse(pairs[i + 1]);
        }
        catch {
            data[pairs[i]] = pairs[i + 1];
        }
    }
    // Reset retry counters
    delete data._retryAttempt;
    delete data._dlqReason;
    delete data._finalAttempt;
    delete data._sentToDLQAt;
    await enqueueTask(targetStream, data);
    await r.xdel(exports.DLQ_STREAM, dlqId);
    console.log(`♻️ Replayed DLQ entry ${dlqId} to ${targetStream}`);
    return true;
}
