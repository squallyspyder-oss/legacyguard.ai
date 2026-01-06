import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createSnapshot, restoreSnapshot, runWithSnapshot } from '../src/lib/execution-pipeline';

async function mkWorkspace() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-ws-'));
  await fs.writeFile(path.join(dir, 'a.txt'), 'orig');
  await fs.mkdir(path.join(dir, 'node_modules'));
  await fs.writeFile(path.join(dir, 'node_modules', 'skip.txt'), 'skip');
  return dir;
}

describe('execution-pipeline snapshots', () => {
  let repo: string;

  beforeEach(async () => {
    repo = await mkWorkspace();
  });

  it('restores files on failure', async () => {
    const result = await runWithSnapshot({
      repoPath: repo,
      run: async () => {
        await fs.writeFile(path.join(repo, 'a.txt'), 'mutated');
        await fs.writeFile(path.join(repo, 'new.txt'), 'new');
        throw new Error('boom');
      },
    });

    expect(result.success).toBe(false);
    const content = await fs.readFile(path.join(repo, 'a.txt'), 'utf-8');
    expect(content).toBe('orig');
    const existsNew = await fs.access(path.join(repo, 'new.txt')).then(() => true).catch(() => false);
    expect(existsNew).toBe(false);
  });

  it('keeps changes on success and cleans snapshot', async () => {
    const res = await runWithSnapshot({
      repoPath: repo,
      run: async () => {
        await fs.writeFile(path.join(repo, 'a.txt'), 'mutated');
        return 'ok';
      },
    });

    expect(res.success).toBe(true);
    expect(res.result).toBe('ok');
    const content = await fs.readFile(path.join(repo, 'a.txt'), 'utf-8');
    expect(content).toBe('mutated');
  });

  it('createSnapshot + restoreSnapshot ignores heavy dirs', async () => {
    const snap = await createSnapshot({ repoPath: repo });
    await fs.writeFile(path.join(repo, 'a.txt'), 'changed');
    await fs.writeFile(path.join(repo, 'node_modules', 'skip.txt'), 'changed');
    await restoreSnapshot(repo, snap.snapshotPath);
    const content = await fs.readFile(path.join(repo, 'a.txt'), 'utf-8');
    expect(content).toBe('orig');
    // ignored dirs are not snapshotted; they remain as mutated
    const nmContent = await fs.readFile(path.join(repo, 'node_modules', 'skip.txt'), 'utf-8');
    expect(nmContent).toBe('changed');
    await snap.cleanup();
  });
});
