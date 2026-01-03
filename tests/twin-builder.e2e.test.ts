import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import fssync from 'fs';
import os from 'os';
import { buildIncidentTwin } from '../src/agents/twin-builder';

const CLONED_DIR = path.join(process.cwd(), '.legacyguard', 'cloned-repos');

beforeEach(async () => {
  process.env.LEGACYGUARD_KEEP_CLONED_REPOS = 'true';
  process.env.LEGACYGUARD_FAKE_CLONE = 'true';
  process.env.LEGACYGUARD_FAKE_SANDBOX = 'true';
  await fs.rm(path.join(process.cwd(), '.legacyguard'), { recursive: true, force: true });
  await fs.mkdir(CLONED_DIR, { recursive: true });

  const oldDir = path.join(CLONED_DIR, 'old-repo');
  await fs.mkdir(oldDir, { recursive: true });
  const past = Date.now() - 3 * 24 * 60 * 60 * 1000;
  await fs.utimes(oldDir, past / 1000, past / 1000);
});

afterEach(async () => {
  vi.clearAllMocks();
  delete process.env.LEGACYGUARD_FAKE_CLONE;
  delete process.env.LEGACYGUARD_FAKE_SANDBOX;
  delete process.env.LEGACYGUARD_KEEP_CLONED_REPOS;
  await fs.rm(path.join(process.cwd(), '.legacyguard'), { recursive: true, force: true });
});

describe('twin-builder e2e (clone → twin → sandbox)', () => {
  it('clones, cleans TTL, writes fixtures, and leaves repo when KEEP is set', async () => {
    const repoPath = path.join(os.tmpdir(), 'non-existent-path');

    const result = await buildIncidentTwin({
      taskId: 'task-e2e',
      incident: {
        id: 'incident-123',
        source: 'sentry',
        title: 'E2E test incident',
        payload: { foo: 'bar' },
        stack: 'Error: boom',
        repo: { owner: 'owner', name: 'repo' },
      },
      repoPath,
      sandbox: { enabled: true, runnerPath: '/fake/runner.sh', command: 'echo test', failMode: 'warn' },
    });

    if (result.status === 'failed') {
      console.error('twin-builder failed:', result.message);
    }

    expect(result.status).toBe('prepared');
    expect(result.repoCloned).toBe(true);
    expect(result.resolvedRepoPath?.startsWith(CLONED_DIR)).toBe(true);

    // TTL cleanup removed old repo
    expect(fssync.existsSync(path.join(CLONED_DIR, 'old-repo'))).toBe(false);

    // Fixture persisted
    expect(result.syntheticFixturePath && fssync.existsSync(result.syntheticFixturePath)).toBe(true);

    // New clone persisted because KEEP flag is set
    expect(result.resolvedRepoPath && fssync.existsSync(result.resolvedRepoPath)).toBe(true);
  });
});
