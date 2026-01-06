import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runSandbox } from '../src/lib/sandbox';

async function mkRepo() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-snap-'));
  await fs.writeFile(path.join(dir, 'file.txt'), 'orig');
  return dir;
}

describe('sandbox snapshotOnFail', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkRepo();
  });

  it('restores workspace when command fails', async () => {
    const result = await runSandbox({
      enabled: true,
      repoPath: repo,
      command: "sh -c 'echo mutated > file.txt; exit 1'",
      useDocker: false,
      fsPolicy: 'readwrite',
      isolationProfile: 'permissive',
    });

    expect(result.success).toBe(false);
    const content = await fs.readFile(path.join(repo, 'file.txt'), 'utf-8');
    expect(content).toBe('orig');
  });

  it('keeps changes when command succeeds', async () => {
    const result = await runSandbox({
      enabled: true,
      repoPath: repo,
      command: "sh -c 'echo mutated > file.txt'",
      useDocker: false,
      fsPolicy: 'readwrite',
      isolationProfile: 'permissive',
    });

    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(repo, 'file.txt'), 'utf-8');
    expect(content).toBe('mutated\n');
  });
});
