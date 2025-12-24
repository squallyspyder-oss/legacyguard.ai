import { describe, it, expect, beforeEach } from 'vitest';
import { enforceQuota, getCurrentMonth } from '../src/lib/quotas';

// Uses in-memory fallback (no AUDIT_DB_URL required)
describe('quotas (in-memory fallback)', () => {
  const month = getCurrentMonth();

  beforeEach(() => {
    // Quotas module keeps in-memory map; use unique users per test to avoid bleed
  });

  it('allows usage within free plan limits', async () => {
    const res = await enforceQuota({
      userId: 'test-user-free',
      role: 'viewer',
      month,
      promptTokens: 50_000,
      completionTokens: 20_000,
      model: 'gpt-4o-mini',
    });
    expect(res.allowed).toBe(true);
  });

  it('blocks when exceeding free monthly tokens', async () => {
    // First call consumes near the limit
    await enforceQuota({
      userId: 'test-user-free-block',
      role: 'viewer',
      month,
      promptTokens: 180_000,
      completionTokens: 10_000,
      model: 'gpt-4o-mini',
    });

    const res = await enforceQuota({
      userId: 'test-user-free-block',
      role: 'viewer',
      month,
      promptTokens: 20_000,
      completionTokens: 5_000,
      model: 'gpt-4o-mini',
    });

    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('quota_exceeded');
  });
});
