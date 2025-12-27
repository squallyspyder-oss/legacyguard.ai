import { Pool } from 'pg';
import { estimateCostUSD, PlanId, PLAN_LIMITS } from './pricing';

export type QuotaStatus = {
  allowed: boolean;
  reason?: string;
  tokensUsed?: number;
  usdUsed?: number;
  tokensLimit?: number;
  usdLimit?: number;
};

let pool: Pool | null = null;
let warningLogged = false;

function getPool() {
  if (pool) return pool;
  const url = process.env.AUDIT_DB_URL || process.env.PGVECTOR_URL;
  if (!url) {
    if (!warningLogged && process.env.NODE_ENV === 'production') {
      console.warn('[QUOTAS] No AUDIT_DB_URL/PGVECTOR_URL configured; quotas are in-memory only.');
      warningLogged = true;
    }
    return null;
  }
  pool = new Pool({ connectionString: url });
  return pool;
}

// In-memory fallback per month (YYYY-MM)
const memoryUsage = new Map<string, { tokensUsed: number; usdUsed: number }>();

function monthKey(userId: string, month: string) {
  return `${userId}:${month}`;
}

async function ensureSchema() {
  const client = getPool();
  if (!client) return; // memory fallback
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_quotas (
      user_id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      monthly_tokens BIGINT NOT NULL,
      monthly_usd NUMERIC(12,4) DEFAULT 0,
      daily_usd NUMERIC(12,4) DEFAULT 0,
      hard_cap BOOLEAN DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_usage (
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      tokens_used BIGINT NOT NULL DEFAULT 0,
      usd_used NUMERIC(12,4) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, month)
    );

    CREATE TABLE IF NOT EXISTS user_usage_daily (
      user_id TEXT NOT NULL,
      day DATE NOT NULL,
      tokens_used BIGINT NOT NULL DEFAULT 0,
      usd_used NUMERIC(12,4) NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, day)
    );

    CREATE TABLE IF NOT EXISTS global_usage_hourly (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      usd NUMERIC(12,4) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS circuit_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      tripped_until TIMESTAMPTZ,
      threshold_usd NUMERIC(12,4),
      paused_ms BIGINT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS quota_reservations (
      task_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      tokens_reserved BIGINT NOT NULL DEFAULT 0,
      usd_reserved NUMERIC(12,4) NOT NULL DEFAULT 0,
      consumed BOOLEAN DEFAULT FALSE,
      refunded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      consumed_at TIMESTAMPTZ,
      refunded_at TIMESTAMPTZ
    );
  `);
}

function defaultPlanForRole(role: string): PlanId {
  if (role === 'admin') return 'enterprise';
  if (role === 'developer') return 'pro';
  if (role === 'viewer') return 'free';
  return 'free';
}

export async function getQuotaStatus(params: {
  userId: string;
  role: string;
  month: string; // YYYY-MM
}): Promise<QuotaStatus & { planId: PlanId; monthlyLimit: number; tokensUsed: number; usdUsed: number }>
{
  const planId = defaultPlanForRole(params.role);
  const limits = PLAN_LIMITS[planId];
  await ensureSchema();

  const client = getPool();
  if (!client) {
    const mem = memoryUsage.get(monthKey(params.userId, params.month)) || { tokensUsed: 0, usdUsed: 0 };
    return {
      allowed: true,
      planId,
      monthlyLimit: limits.monthlyTokens,
      tokensUsed: mem.tokensUsed,
      usdUsed: mem.usdUsed,
      tokensLimit: limits.monthlyTokens,
    };
  }

  const res = await client.query(
    'SELECT tokens_used, usd_used FROM user_usage WHERE user_id = $1 AND month = $2',
    [params.userId, params.month]
  );
  const row = res.rows[0] || { tokens_used: 0, usd_used: 0 };
  return {
    allowed: true,
    planId,
    monthlyLimit: limits.monthlyTokens,
    tokensUsed: Number(row.tokens_used) || 0,
    usdUsed: Number(row.usd_used) || 0,
    tokensLimit: limits.monthlyTokens,
  };
}

export async function enforceQuota(params: {
  userId: string;
  role: string;
  month: string; // YYYY-MM
  promptTokens: number;
  completionTokens: number;
  model: string;
}): Promise<QuotaStatus & { planId: PlanId; tokensUsed?: number; usdUsed?: number }>
{
  const planId = defaultPlanForRole(params.role);
  const limits = PLAN_LIMITS[planId];
  const month = params.month;

  const cost = estimateCostUSD({
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
  });
  const tokens = params.promptTokens + params.completionTokens;

  await ensureSchema();
  const client = getPool();

  if (!client) {
    const key = monthKey(params.userId, month);
    const prev = memoryUsage.get(key) || { tokensUsed: 0, usdUsed: 0 };
    const nextTokens = prev.tokensUsed + tokens;
    const allowed = limits.hardCap ? nextTokens <= limits.monthlyTokens : true;
    if (!allowed) {
      return { allowed: false, planId, reason: 'quota_exceeded', tokensLimit: limits.monthlyTokens, tokensUsed: prev.tokensUsed };
    }
    memoryUsage.set(key, { tokensUsed: nextTokens, usdUsed: prev.usdUsed + cost.usd });
    return { allowed: true, planId, tokensUsed: nextTokens, usdUsed: prev.usdUsed + cost.usd };
  }

  const clientRes = await client.query('BEGIN');
  try {
    const res = await client.query(
      `INSERT INTO user_usage (user_id, month, tokens_used, usd_used)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, month) DO UPDATE
       SET tokens_used = user_usage.tokens_used + EXCLUDED.tokens_used,
           usd_used = user_usage.usd_used + EXCLUDED.usd_used,
           updated_at = NOW()
       RETURNING tokens_used, usd_used`,
      [params.userId, month, tokens, cost.usd]
    );

    const row = res.rows[0];
    const allowed = limits.hardCap ? Number(row.tokens_used) <= limits.monthlyTokens : true;
    if (!allowed) {
      await client.query('ROLLBACK');
      return {
        allowed: false,
        planId,
        reason: 'quota_exceeded',
        tokensUsed: Number(row.tokens_used),
        usdUsed: Number(row.usd_used),
        tokensLimit: limits.monthlyTokens,
      };
    }
    await client.query('COMMIT');
    // record daily rollup
    try {
      await client.query(
        `INSERT INTO user_usage_daily (user_id, day, tokens_used, usd_used)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO UPDATE
         SET tokens_used = user_usage_daily.tokens_used + EXCLUDED.tokens_used,
             usd_used = user_usage_daily.usd_used + EXCLUDED.usd_used,
             updated_at = NOW()`,
        [params.userId, new Date().toISOString().slice(0, 10), tokens, cost.usd]
      );
    } catch (err) {
      // non-fatal
    }

    // record hourly global usage and evaluate circuit
    try {
      await client.query('INSERT INTO global_usage_hourly (usd) VALUES ($1)', [cost.usd]);
      const threshold = Number(process.env.QUOTA_CIRCUIT_THRESHOLD_USD || 1000);
      const pauseMs = Number(process.env.QUOTA_CIRCUIT_PAUSE_MS || 10 * 60 * 1000);
      const res = await client.query(`SELECT COALESCE(SUM(usd),0) as sum FROM global_usage_hourly WHERE ts > NOW() - INTERVAL '1 hour'`);
      const sum = Number(res.rows[0]?.sum || 0);
      if (sum >= threshold) {
        tripCircuitFor(pauseMs);
        try {
          await client.query(
            `INSERT INTO circuit_state (id, tripped_until, threshold_usd, paused_ms, updated_at)
             VALUES (1, NOW() + ($1 || ' milliseconds')::interval, $2, $3, NOW())
             ON CONFLICT (id) DO UPDATE SET tripped_until = NOW() + ($1 || ' milliseconds')::interval, threshold_usd = $2, paused_ms = $3, updated_at = NOW()`,
            [pauseMs, threshold, pauseMs]
          );
        } catch {}
      }
    } catch (err) {
      // non-fatal
    }
    return {
      allowed: true,
      planId,
      tokensUsed: Number(row.tokens_used),
      usdUsed: Number(row.usd_used),
      tokensLimit: limits.monthlyTokens,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

// Reserve quota for a task (called pre-run). Stores a reservation so we can refund if task cancelled.
export async function reserveQuota(params: {
  taskId: string;
  userId: string;
  month: string;
  tokens: number;
  usd: number;
}): Promise<boolean> {
  await ensureSchema();
  const client = getPool();
  if (!client) {
    // in-memory: create a simple reservation map
    const key = `res:${params.taskId}`;
    // store in memoryUsage for simplicity by decrementing later
    memoryUsage.set(key, { tokensUsed: params.tokens, usdUsed: params.usd });
    return true;
  }

  try {
    await client.query(
      `INSERT INTO quota_reservations (task_id, user_id, month, tokens_reserved, usd_reserved) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (task_id) DO UPDATE SET tokens_reserved = EXCLUDED.tokens_reserved, usd_reserved = EXCLUDED.usd_reserved, refunded = FALSE, consumed = FALSE, created_at = NOW()`,
      [params.taskId, params.userId, params.month, params.tokens, params.usd]
    );
    return true;
  } catch (err) {
    return false;
  }
}

export async function consumeReservation(taskId: string): Promise<boolean> {
  const client = getPool();
  if (!client) return true;
  try {
    await client.query(`UPDATE quota_reservations SET consumed = TRUE, consumed_at = NOW() WHERE task_id = $1`, [taskId]);
    return true;
  } catch (err) {
    return false;
  }
}

export async function refundReservation(taskId: string): Promise<boolean> {
  await ensureSchema();
  const client = getPool();
  if (!client) {
    const key = `res:${taskId}`;
    if (memoryUsage.has(key)) {
      memoryUsage.delete(key);
      return true;
    }
    return false;
  }

  const tx = await client.query('BEGIN');
  try {
    const res = await client.query('SELECT * FROM quota_reservations WHERE task_id = $1 FOR UPDATE', [taskId]);
    const row = res.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return false;
    }

    if (row.refunded) {
      await client.query('ROLLBACK');
      return false;
    }

    // Decrement user_usage and daily
    const tokens = Number(row.tokens_reserved || 0);
    const usd = Number(row.usd_reserved || 0);
    await client.query(
      `UPDATE user_usage SET tokens_used = GREATEST(tokens_used - $1,0), usd_used = GREATEST(usd_used - $2,0), updated_at = NOW() WHERE user_id = $3 AND month = $4`,
      [tokens, usd, row.user_id, row.month]
    );
    await client.query(
      `UPDATE user_usage_daily SET tokens_used = GREATEST(tokens_used - $1,0), usd_used = GREATEST(usd_used - $2,0), updated_at = NOW() WHERE user_id = $3 AND day = $4`,
      [tokens, usd, row.user_id, row.month + '-01']
    );

    await client.query(`UPDATE quota_reservations SET refunded = TRUE, refunded_at = NOW() WHERE task_id = $1`, [taskId]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    return false;
  }
}

// Circuit breaker simples: bloqueia se gasto/hora exceder threshold
let circuitTrippedUntil = 0;
export function isCircuitTripped(): boolean {
  return Date.now() < circuitTrippedUntil;
}

export function tripCircuitFor(ms: number) {
  circuitTrippedUntil = Date.now() + ms;
}

// Administrative helpers used by admin routes
export async function adjustUserUsage(params: {
  userId: string;
  month: string;
  tokensDelta?: number;
  usdDelta?: number;
  day?: string;
}): Promise<boolean> {
  const tokensDelta = params.tokensDelta || 0;
  const usdDelta = params.usdDelta || 0;
  await ensureSchema();
  const client = getPool();
  if (!client) {
    const key = monthKey(params.userId, params.month);
    const prev = memoryUsage.get(key) || { tokensUsed: 0, usdUsed: 0 };
    memoryUsage.set(key, { tokensUsed: Math.max(0, prev.tokensUsed + tokensDelta), usdUsed: Math.max(0, prev.usdUsed + usdDelta) });
    if (params.day) {
      const dayKey = monthKey(params.userId, params.day);
      const prevd = memoryUsage.get(dayKey) || { tokensUsed: 0, usdUsed: 0 };
      memoryUsage.set(dayKey, { tokensUsed: Math.max(0, prevd.tokensUsed + tokensDelta), usdUsed: Math.max(0, prevd.usdUsed + usdDelta) });
    }
    return true;
  }

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO user_usage (user_id, month, tokens_used, usd_used)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, month) DO UPDATE
       SET tokens_used = GREATEST(user_usage.tokens_used + $3, 0),
           usd_used = GREATEST(user_usage.usd_used + $4, 0),
           updated_at = NOW()`,
      [params.userId, params.month, tokensDelta, usdDelta]
    );

    if (params.day) {
      await client.query(
        `INSERT INTO user_usage_daily (user_id, day, tokens_used, usd_used)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, day) DO UPDATE
         SET tokens_used = GREATEST(user_usage_daily.tokens_used + $3, 0),
             usd_used = GREATEST(user_usage_daily.usd_used + $4, 0),
             updated_at = NOW()`,
        [params.userId, params.day, tokensDelta, usdDelta]
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    return false;
  }
}

export async function resetCircuit(): Promise<boolean> {
  // reset in-memory
  circuitTrippedUntil = 0;
  const client = getPool();
  if (!client) return true;
  try {
    await client.query(
      `INSERT INTO circuit_state (id, tripped_until, threshold_usd, paused_ms, updated_at)
       VALUES (1, NULL, NULL, NULL, NOW())
       ON CONFLICT (id) DO UPDATE SET tripped_until = NULL, updated_at = NOW()`
    );
    return true;
  } catch (err) {
    return false;
  }
}

export async function getCircuitStatus() {
  const client = getPool();
  if (!client) {
    return { tripped: isCircuitTripped(), until: circuitTrippedUntil, thresholdUsd: Number(process.env.QUOTA_CIRCUIT_THRESHOLD_USD || 1000), pausedMs: Number(process.env.QUOTA_CIRCUIT_PAUSE_MS || 600000) };
  }
  try {
    const res = await client.query('SELECT tripped_until, threshold_usd, paused_ms FROM circuit_state WHERE id = 1');
    const row = res.rows[0];
    const until = row?.tripped_until ? new Date(row.tripped_until).getTime() : circuitTrippedUntil || null;
    return { tripped: Date.now() < (until || 0), until, thresholdUsd: Number(row?.threshold_usd || process.env.QUOTA_CIRCUIT_THRESHOLD_USD || 1000), pausedMs: Number(row?.paused_ms || process.env.QUOTA_CIRCUIT_PAUSE_MS || 600000) };
  } catch {
    return { tripped: isCircuitTripped(), until: circuitTrippedUntil, thresholdUsd: Number(process.env.QUOTA_CIRCUIT_THRESHOLD_USD || 1000), pausedMs: Number(process.env.QUOTA_CIRCUIT_PAUSE_MS || 600000) };
  }
}

export function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}
