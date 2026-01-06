import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { logEvent } from './audit';

export type SnapshotOptions = {
  repoPath: string;
  ignore?: string[];
};

export type SnapshotHandle = {
  snapshotPath: string;
  cleanup: () => Promise<void>;
};

const DEFAULT_IGNORE = ['node_modules', '.git', '.next', 'dist', 'build', 'out'];

function shouldIgnore(filePath: string, ignore: string[], repoPath: string) {
  const rel = path.relative(repoPath, filePath).split(path.sep)[0];
  return ignore.includes(rel);
}

async function emptyRepoPath(repoPath: string, ignore: string[]) {
  const entries = await fs.readdir(repoPath, { withFileTypes: true });
  for (const entry of entries) {
    if (ignore.includes(entry.name)) continue;
    const full = path.join(repoPath, entry.name);
    await fs.rm(full, { recursive: true, force: true });
  }
}

export async function createSnapshot(options: SnapshotOptions): Promise<SnapshotHandle> {
  const { repoPath, ignore = DEFAULT_IGNORE } = options;
  const tmpBase = await fs.mkdtemp(path.join(os.tmpdir(), 'lg-snap-'));
  const snapshotPath = path.join(tmpBase, 'workspace');
  
  try {
    await fs.cp(repoPath, snapshotPath, {
      recursive: true,
      filter: (src) => !shouldIgnore(src, ignore, repoPath),
    });

    // Audit snapshot creation
    await logEvent({
      action: 'snapshot.created',
      severity: 'info',
      message: `Snapshot created for rollback capability`,
      metadata: { repoPath, snapshotPath, ignore },
    }).catch(() => undefined);

    return {
      snapshotPath,
      cleanup: () => fs.rm(tmpBase, { recursive: true, force: true }),
    };
  } catch (err) {
    // Audit snapshot failure
    await logEvent({
      action: 'snapshot.failed',
      severity: 'error',
      message: `Failed to create snapshot: ${(err as Error).message}`,
      metadata: { repoPath, error: (err as Error).message },
    }).catch(() => undefined);

    // Cleanup partial snapshot
    await fs.rm(tmpBase, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

export async function restoreSnapshot(repoPath: string, snapshotPath: string, ignore: string[] = DEFAULT_IGNORE) {
  try {
    await emptyRepoPath(repoPath, ignore);
    await fs.cp(snapshotPath, repoPath, {
      recursive: true,
      filter: (src) => !shouldIgnore(src, ignore, snapshotPath),
    });

    // Audit successful restore
    await logEvent({
      action: 'snapshot.restored',
      severity: 'warn',
      message: `Workspace restored from snapshot after execution failure`,
      metadata: { repoPath, snapshotPath },
    }).catch(() => undefined);
  } catch (err) {
    // Audit restore failure - this is critical
    await logEvent({
      action: 'snapshot.restore_failed',
      severity: 'error',
      message: `CRITICAL: Failed to restore snapshot - workspace may be corrupted`,
      metadata: { repoPath, snapshotPath, error: (err as Error).message },
    }).catch(() => undefined);
    throw err;
  }
}

export async function runWithSnapshot<T>(params: {
  repoPath: string;
  ignore?: string[];
  run: () => Promise<T>;
}): Promise<{ success: true; result: T; restored: false } | { success: false; error: unknown; restored: boolean }>
{
  const ignore = params.ignore || DEFAULT_IGNORE;
  const snap = await createSnapshot({ repoPath: params.repoPath, ignore });
  try {
    const result = await params.run();
    await snap.cleanup();
    return { success: true, result, restored: false };
  } catch (error) {
    await restoreSnapshot(params.repoPath, snap.snapshotPath, ignore);
    await snap.cleanup();
    return { success: false, error, restored: true };
  }
}
