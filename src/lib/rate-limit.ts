// Rate limiting middleware for API routes
// Uses in-memory store by default, Redis when available

import { NextResponse } from 'next/server';

type RateLimitConfig = {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyPrefix?: string; // Prefix for rate limit keys
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// In-memory store (fallback)
const memoryStore = new Map<string, RateLimitEntry>();

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    if (entry.resetAt < now) {
      memoryStore.delete(key);
    }
  }
}, 60_000); // Every minute

export const RATE_LIMIT_PRESETS = {
  // Strict: for expensive operations (LLM calls, orchestration)
  strict: { windowMs: 60_000, maxRequests: 10 },
  // Standard: for normal API calls
  standard: { windowMs: 60_000, maxRequests: 60 },
  // Relaxed: for read-only endpoints
  relaxed: { windowMs: 60_000, maxRequests: 120 },
  // Auth: for login/signup attempts
  auth: { windowMs: 300_000, maxRequests: 5 },
} as const;

function getClientKey(request: Request, prefix: string): string {
  // Try to get real IP from headers (reverse proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || realIp || 'anonymous';
  return `${prefix}:${ip}`;
}

async function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    const newEntry: RateLimitEntry = {
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
async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number } | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // Dynamic import to avoid issues when Redis not available
    const { default: Redis } = await import('ioredis');
    
    // Create connection with timeout
    const redis = new Redis(redisUrl, {
      connectTimeout: 3000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Don't retry, fallback to memory
    });

    // Add connection timeout
    const connectionPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
      redis.on('connect', () => { clearTimeout(timeout); resolve(); });
      redis.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });

    try {
      await connectionPromise;
    } catch {
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
  } catch {
    // Redis unavailable, fall back to memory
    return null;
  }
}

export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMIT_PRESETS.standard
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = getClientKey(request, config.keyPrefix || 'api');

  // Try Redis first (for distributed rate limiting)
  const redisResult = await checkRateLimitRedis(key, config);
  if (redisResult) return redisResult;

  // Fallback to in-memory
  return checkRateLimitMemory(key, config);
}

export function rateLimitResponse(resetAt: number): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    {
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
      },
    }
  );
}

// Middleware helper for route handlers
export async function withRateLimit<T>(
  request: Request,
  handler: () => Promise<T>,
  config: RateLimitConfig = RATE_LIMIT_PRESETS.standard
): Promise<T | NextResponse> {
  const result = await checkRateLimit(request, config);

  if (!result.allowed) {
    return rateLimitResponse(result.resetAt);
  }

  return handler();
}

// HOF for wrapping route handlers
export function rateLimit(config: RateLimitConfig = RATE_LIMIT_PRESETS.standard) {
  return function <T extends (...args: [Request, ...unknown[]]) => Promise<NextResponse>>(
    handler: T
  ): T {
    return (async (request: Request, ...args: unknown[]) => {
      const result = await checkRateLimit(request, config);
      if (!result.allowed) {
        return rateLimitResponse(result.resetAt);
      }
      return handler(request, ...args);
    }) as T;
  };
}
