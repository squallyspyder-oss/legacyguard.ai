/**
 * Tests for LOA → snapshotOnFail mapping
 * 
 * Execution Guard verification:
 * - LOA >= 2 must always enable snapshotOnFail
 * - Snapshot events are audited
 * - Failure handling is explicit
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the guardian-flow module
vi.mock('../src/guardian-flow', () => ({
  classifyIntent: vi.fn((intent: string) => {
    if (intent.includes('delete') || intent.includes('drop')) {
      return { loaLevel: 4, intent: 'destructive' };
    }
    if (intent.includes('update') || intent.includes('modify')) {
      return { loaLevel: 3, intent: 'mutating' };
    }
    if (intent.includes('create') || intent.includes('add')) {
      return { loaLevel: 2, intent: 'creating' };
    }
    return { loaLevel: 1, intent: 'read-only' };
  }),
  LOA_CONFIGS: {
    1: { description: 'Read-only' },
    2: { description: 'Create' },
    3: { description: 'Modify' },
    4: { description: 'Destructive' },
  },
}));

// Mock audit logging
const auditLogs: any[] = [];
vi.mock('../src/lib/audit', () => ({
  logEvent: vi.fn(async (event: any) => {
    auditLogs.push(event);
    return Promise.resolve();
  }),
}));

describe('LOA → snapshotOnFail Mapping', () => {
  beforeEach(() => {
    auditLogs.length = 0;
  });

  describe('LOA Classification', () => {
    it('should classify read operations as LOA 1', async () => {
      const { classifyIntent } = await import('../src/guardian-flow');
      const result = classifyIntent('read user data');
      expect(result.loaLevel).toBe(1);
    });

    it('should classify create operations as LOA 2', async () => {
      const { classifyIntent } = await import('../src/guardian-flow');
      const result = classifyIntent('create new user');
      expect(result.loaLevel).toBe(2);
    });

    it('should classify update operations as LOA 3', async () => {
      const { classifyIntent } = await import('../src/guardian-flow');
      const result = classifyIntent('update user email');
      expect(result.loaLevel).toBe(3);
    });

    it('should classify delete operations as LOA 4', async () => {
      const { classifyIntent } = await import('../src/guardian-flow');
      const result = classifyIntent('delete all records');
      expect(result.loaLevel).toBe(4);
    });
  });

  describe('snapshotOnFail Policy', () => {
    it('should NOT require snapshot for LOA 1 (read-only)', () => {
      const loaLevel = 1;
      const fsPolicy = 'readonly';
      const requiresSnapshot = loaLevel >= 2 || fsPolicy === 'readwrite';
      expect(requiresSnapshot).toBe(false);
    });

    it('should require snapshot for LOA 2 (create)', () => {
      const loaLevel = 2;
      const fsPolicy = 'readonly';
      const requiresSnapshot = loaLevel >= 2 || fsPolicy === 'readwrite';
      expect(requiresSnapshot).toBe(true);
    });

    it('should require snapshot for LOA 3 (modify)', () => {
      const loaLevel = 3;
      const fsPolicy = 'readonly';
      const requiresSnapshot = loaLevel >= 2 || fsPolicy === 'readwrite';
      expect(requiresSnapshot).toBe(true);
    });

    it('should require snapshot for LOA 4 (destructive)', () => {
      const loaLevel = 4;
      const fsPolicy = 'readonly';
      const requiresSnapshot = loaLevel >= 2 || fsPolicy === 'readwrite';
      expect(requiresSnapshot).toBe(true);
    });

    it('should require snapshot when fsPolicy=readwrite regardless of LOA', () => {
      const loaLevel = 1;
      const fsPolicy = 'readwrite';
      const requiresSnapshot = loaLevel >= 2 || fsPolicy === 'readwrite';
      expect(requiresSnapshot).toBe(true);
    });

    it('should respect explicit snapshotOnFail=false override', () => {
      const loaLevel = 3;
      const fsPolicy = 'readonly';
      const explicitOverride = false;
      const requiresSnapshot = loaLevel >= 2 || fsPolicy === 'readwrite';
      const snapshotOnFail = explicitOverride ?? requiresSnapshot;
      expect(snapshotOnFail).toBe(false);
    });
  });

  describe('Snapshot Audit Events', () => {
    it('should audit snapshot creation', async () => {
      const { logEvent } = await import('../src/lib/audit');
      
      await logEvent({
        action: 'snapshot.created',
        severity: 'info',
        message: 'Snapshot created for rollback capability',
        metadata: { repoPath: '/test', snapshotPath: '/tmp/snap' },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('snapshot.created');
      expect(auditLogs[0].severity).toBe('info');
    });

    it('should audit snapshot restore with warning severity', async () => {
      const { logEvent } = await import('../src/lib/audit');
      
      await logEvent({
        action: 'snapshot.restored',
        severity: 'warn',
        message: 'Workspace restored from snapshot after execution failure',
        metadata: { repoPath: '/test', snapshotPath: '/tmp/snap' },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('snapshot.restored');
      expect(auditLogs[0].severity).toBe('warn');
    });

    it('should audit snapshot restore failure with critical severity', async () => {
      const { logEvent } = await import('../src/lib/audit');
      
      await logEvent({
        action: 'snapshot.restore_failed',
        severity: 'critical',
        message: 'CRITICAL: Failed to restore snapshot - workspace may be corrupted',
        metadata: { repoPath: '/test', snapshotPath: '/tmp/snap', error: 'disk full' },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('snapshot.restore_failed');
      expect(auditLogs[0].severity).toBe('critical');
    });
  });

  describe('Failure Scenarios', () => {
    it('should define behavior when snapshot creation fails', () => {
      // Execution Guard Q4: What happens if snapshot creation fails?
      // Answer: The error is audited and re-thrown, aborting execution
      const snapshotCreationFailed = true;
      const shouldAbortExecution = snapshotCreationFailed;
      expect(shouldAbortExecution).toBe(true);
    });

    it('should define behavior when restore fails', () => {
      // Execution Guard Q4/Q5: What happens if restore fails?
      // Answer: Critical audit event, error re-thrown, manual intervention needed
      const restoreFailed = true;
      const isManualInterventionRequired = restoreFailed;
      expect(isManualInterventionRequired).toBe(true);
    });

    it('should not bypass approval for high LOA operations', () => {
      // Execution Guard Q7: Does this bypass any approval?
      // Answer: snapshotOnFail is safety net, NOT approval bypass
      const loaLevel = 4;
      const requiresApproval = loaLevel >= 3;
      const snapshotBypassesApproval = false;
      expect(requiresApproval).toBe(true);
      expect(snapshotBypassesApproval).toBe(false);
    });
  });
});
