import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { verifySignature, isReplay } from '../src/app/api/github/webhook/route';

const SECRET = 'test-secret';

function sign(body: string) {
  return `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

describe('webhook.verifySignature', () => {
  const prev = process.env.GITHUB_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env.GITHUB_WEBHOOK_SECRET;
    } else {
      process.env.GITHUB_WEBHOOK_SECRET = prev;
    }
    vi.useRealTimers();
  });

  it('accepts valid signature', () => {
    const body = '{"test":true}';
    const sig = sign(body);
    expect(verifySignature(body, sig)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const body = '{"test":true}';
    const sig = 'sha256=deadbeef';
    expect(verifySignature(body, sig)).toBe(false);
  });

  it('allows missing secret in dev mode (no secret set)', () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = '{"test":true}';
    // Without secret configured, it should return true to avoid blocking dev
    expect(verifySignature(body, null)).toBe(true);
  });
});

describe('webhook.isReplay', () => {
  it('detects repeated delivery within TTL', () => {
    const deliveryId = 'delivery-1';
    expect(isReplay(deliveryId)).toBe(false);
    expect(isReplay(deliveryId)).toBe(true);
  });

  it('expires entries after TTL and allows again', () => {
    vi.useFakeTimers();
    const start = new Date('2024-01-01T00:00:00Z');
    vi.setSystemTime(start);

    const deliveryId = 'delivery-2';
    expect(isReplay(deliveryId)).toBe(false);

    // Advance beyond TTL (5 min) to trigger cleanup and allow again
    vi.setSystemTime(new Date(start.getTime() + 5 * 60 * 1000 + 1000));
    expect(isReplay(deliveryId)).toBe(false);
  });
});
