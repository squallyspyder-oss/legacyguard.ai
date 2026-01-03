import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { POST } from '../src/app/api/github/webhook/route';
import { enqueueTask } from '@/lib/queue';
import { isVectorIndexingEnabled } from '@/lib/indexer-pgvector';

vi.mock('@/lib/queue', () => ({
  enqueueTask: vi.fn(),
}));

vi.mock('@/lib/indexer-pgvector', () => ({
  isVectorIndexingEnabled: vi.fn(() => true),
}));

const SECRET = 'queue-secret';

function sign(body: string) {
  return `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`;
}

describe('webhook → queue → indexação', () => {
  beforeEach(() => {
    process.env.GITHUB_WEBHOOK_SECRET = SECRET;
    vi.mocked(isVectorIndexingEnabled).mockReturnValue(true);
    vi.mocked(enqueueTask).mockResolvedValue('1-0');
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    vi.clearAllMocks();
  });

  it('enqueues indexing job for valid signed request', async () => {
    const payload = {
      repository: { full_name: 'owner/repo', default_branch: 'main' },
      ref: 'refs/heads/main',
      after: 'commit-sha',
      sender: { login: 'tester' },
    };
    const body = JSON.stringify(payload);
    const req = new Request('http://localhost/api/github/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': sign(body),
        'x-github-delivery': 'delivery-123',
        'content-type': 'application/json',
      },
    });

    const res = await POST(req as any);
    const json = await res.json();

    expect(json.queued).toBe(true);
    expect(enqueueTask).toHaveBeenCalledWith(
      'indexing',
      expect.objectContaining({ owner: 'owner', repo: 'repo', eventType: 'push', deliveryId: 'delivery-123' })
    );
  });

  it('rejects invalid signature and does not enqueue', async () => {
    const payload = { repository: { full_name: 'owner/repo', default_branch: 'main' } };
    const body = JSON.stringify(payload);
    const req = new Request('http://localhost/api/github/webhook', {
      method: 'POST',
      body,
      headers: {
        'x-github-event': 'push',
        'x-hub-signature-256': 'sha256=invalid',
        'content-type': 'application/json',
      },
    });

    const res = await POST(req as any);
    expect(res.status).toBe(401);
    expect(enqueueTask).not.toHaveBeenCalled();
  });
});
