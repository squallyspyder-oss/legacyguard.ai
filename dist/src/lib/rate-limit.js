"use strict";
// Rate limiting middleware for API routes
// Uses in-memory store by default, Redis when available
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RATE_LIMIT_PRESETS = void 0;
exports.checkRateLimit = checkRateLimit;
exports.rateLimitResponse = rateLimitResponse;
exports.withRateLimit = withRateLimit;
exports.rateLimit = rateLimit;
const server_1 = require("next/server");
// In-memory store (fallback)
const memoryStore = new Map();
// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore.entries()) {
        if (entry.resetAt < now) {
            memoryStore.delete(key);
        }
    }
}, 60000); // Every minute
exports.RATE_LIMIT_PRESETS = {
    // Strict: for expensive operations (LLM calls, orchestration)
    strict: { windowMs: 60000, maxRequests: 10 },
    // Standard: for normal API calls
    standard: { windowMs: 60000, maxRequests: 60 },
    // Relaxed: for read-only endpoints
    relaxed: { windowMs: 60000, maxRequests: 120 },
    // Auth: for login/signup attempts
    auth: { windowMs: 300000, maxRequests: 5 },
};
function getClientKey(request, prefix) {
    var _a;
    // Try to get real IP from headers (reverse proxy)
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const ip = ((_a = forwarded === null || forwarded === void 0 ? void 0 : forwarded.split(',')[0]) === null || _a === void 0 ? void 0 : _a.trim()) || realIp || 'anonymous';
    return `${prefix}:${ip}`;
}
async function checkRateLimitMemory(key, config) {
    const now = Date.now();
    const entry = memoryStore.get(key);
    if (!entry || entry.resetAt < now) {
        // New window
        const newEntry = {
            count: 1,
            resetAt: now + config.windowMs,
        };
        memoryStore.set(key, newEntry);
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: newEntry.resetAt };
    }
    if (entry.count >= config.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }
    entry.count++;
    return { allowed: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt };
}
// Optional: Redis-based rate limiting for distributed deployments
async function checkRateLimitRedis(key, config) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl)
        return null;
    try {
        // Dynamic import to avoid issues when Redis not available
        const { default: Redis } = await Promise.resolve().then(() => __importStar(require('ioredis')));
        // Create connection with timeout
        const redis = new Redis(redisUrl, {
            connectTimeout: 3000,
            commandTimeout: 3000,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null, // Don't retry, fallback to memory
        });
        // Add connection timeout
        const connectionPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
            redis.on('connect', () => { clearTimeout(timeout); resolve(); });
            redis.on('error', (err) => { clearTimeout(timeout); reject(err); });
        });
        try {
            await connectionPromise;
        }
        catch {
            redis.disconnect();
            return null;
        }
        const now = Date.now();
        const windowKey = `ratelimit:${key}:${Math.floor(now / config.windowMs)}`;
        const count = await redis.incr(windowKey);
        if (count === 1) {
            await redis.pexpire(windowKey, config.windowMs);
        }
        const ttl = await redis.pttl(windowKey);
        redis.disconnect();
        const resetAt = now + (ttl > 0 ? ttl : config.windowMs);
        const allowed = count <= config.maxRequests;
        const remaining = Math.max(0, config.maxRequests - count);
        return { allowed, remaining, resetAt };
    }
    catch {
        // Redis unavailable, fall back to memory
        return null;
    }
}
async function checkRateLimit(request, config = exports.RATE_LIMIT_PRESETS.standard) {
    const key = getClientKey(request, config.keyPrefix || 'api');
    // Try Redis first (for distributed rate limiting)
    const redisResult = await checkRateLimitRedis(key, config);
    if (redisResult)
        return redisResult;
    // Fallback to in-memory
    return checkRateLimitMemory(key, config);
}
function rateLimitResponse(resetAt) {
    const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
    return server_1.NextResponse.json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
    }, {
        status: 429,
        headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
        },
    });
}
// Middleware helper for route handlers
async function withRateLimit(request, handler, config = exports.RATE_LIMIT_PRESETS.standard) {
    const result = await checkRateLimit(request, config);
    if (!result.allowed) {
        return rateLimitResponse(result.resetAt);
    }
    return handler();
}
// HOF for wrapping route handlers
function rateLimit(config = exports.RATE_LIMIT_PRESETS.standard) {
    return function (handler) {
        return (async (request, ...args) => {
            const result = await checkRateLimit(request, config);
            if (!result.allowed) {
                return rateLimitResponse(result.resetAt);
            }
            return handler(request, ...args);
        });
    };
}
