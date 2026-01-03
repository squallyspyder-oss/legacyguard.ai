import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifySignature } from '../src/app/api/github/webhook/route';

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
