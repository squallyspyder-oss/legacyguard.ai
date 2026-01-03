import { Pool } from 'pg';
import crypto from 'crypto';
import { sanitizeMetadata } from './secrets';

export type AuditSeverity = 'info' | 'warn' | 'error';

export type AuditRepo = {
  provider?: string;
  owner: string;
  repo: string;
  default_branch?: string;
};

export type AuditLogInput = {
  actor?: string;
  action: string;
  severity?: AuditSeverity;
  message?: string;
  metadata?: Record<string, unknown>;
  repo?: AuditRepo;
};

export type AuditArtifactInput = {
  repo?: AuditRepo;
  logId?: number;
  kind: string;
  storageUrl?: string;
  checksum?: string;
  sizeBytes?: number;
};

// Structured evidence helpers
export type AuditCommandRun = {
  command: string;
  exitCode: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  timestamp?: string;
};

export type AuditDiff = {
  summary?: string;
  files?: string[];
  patch?: string;
  prUrl?: string;
};

export type AuditTestResult = {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  details?: Record<string, unknown>;
};

export type AuditFinding = {
  tool: string; // e.g., semgrep, npm-audit, pip-audit
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  location?: string;
  fingerprint?: string;
  details?: Record<string, unknown>;
};

export type AuditApproval = {
  decision: 'approved' | 'rejected';
  actor?: string;
  reason?: string;
  timestamp?: string;
};

export type AuditEvidenceInput = {
  actor?: string;
  repo?: AuditRepo & { commit?: string; branch?: string; hash?: string };
  commands?: AuditCommandRun[];
  diffs?: AuditDiff[];
  tests?: AuditTestResult[];
  findings?: AuditFinding[];
  approval?: AuditApproval;
  rollbackPlan?: string;
  message?: string;
  scope?: string;
};

let pool: Pool | null = null;
const inMemoryLogs: Array<AuditLogInput & { id: number; created_at: string }> = [];
const inMemoryArtifacts: Array<AuditArtifactInput & { id: number; created_at: string }> = [];
let memoryId = 1;

// Track if warning was already logged
let dbWarningLogged = false;

function getPool() {
  if (pool) return pool;
  const url = process.env.AUDIT_DB_URL || process.env.PGVECTOR_URL;
  if (!url) {
    // Fallback to in-memory - warn in production
    if (!dbWarningLogged && process.env.NODE_ENV === 'production') {
      console.warn(
        '⚠️  [AUDIT] AUDIT_DB_URL not configured! Audit logs are stored in-memory and will be LOST on restart.\n' +
        '    Set AUDIT_DB_URL or PGVECTOR_URL environment variable for persistent audit logging.'
      );
      dbWarningLogged = true;
    }
    return null;
  }
  pool = new Pool({ connectionString: url });
  return pool;
}

/** Check if audit is using persistent storage */
export function isAuditPersistent(): boolean {
  return !!(process.env.AUDIT_DB_URL || process.env.PGVECTOR_URL);
}

/** Get audit storage status for health checks */
export function getAuditStorageStatus(): { persistent: boolean; warning?: string } {
  const persistent = isAuditPersistent();
  return {
    persistent,
    warning: persistent
      ? undefined
      : 'Audit logs are stored in-memory. Configure AUDIT_DB_URL for persistence.',
  };
}

async function ensureSchema() {
  const client = getPool();
  if (!client) return; // modo memória
  
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    
    // Criar tabela de repos primeiro
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_repos (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'github',
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        default_branch TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (provider, owner, repo)
      );
    `);
    
    // Criar tabela de logs (estrutura básica)
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGSERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    
    // Adicionar colunas que podem estar faltando (migrações)
    await client.query(`
      DO $$
      BEGIN
        -- Adicionar repo_id
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'repo_id') THEN
          ALTER TABLE audit_logs ADD COLUMN repo_id INTEGER REFERENCES audit_repos(id) ON DELETE SET NULL;
        END IF;
        -- Adicionar actor
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'actor') THEN
          ALTER TABLE audit_logs ADD COLUMN actor TEXT;
        END IF;
        -- Adicionar severity
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'severity') THEN
          ALTER TABLE audit_logs ADD COLUMN severity TEXT NOT NULL DEFAULT 'info';
        END IF;
        -- Adicionar message
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'message') THEN
          ALTER TABLE audit_logs ADD COLUMN message TEXT;
        END IF;
        -- Adicionar metadata
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'metadata') THEN
          ALTER TABLE audit_logs ADD COLUMN metadata JSONB;
        END IF;
        -- Remover NOT NULL constraint de session_id se existir
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'session_id') THEN
          ALTER TABLE audit_logs ALTER COLUMN session_id DROP NOT NULL;
        END IF;
      END $$;
    `);

    // Criar tabela de artifacts
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_artifacts (
        id BIGSERIAL PRIMARY KEY,
        kind TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    
    // Adicionar colunas em artifacts que podem estar faltando
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_artifacts' AND column_name = 'repo_id') THEN
          ALTER TABLE audit_artifacts ADD COLUMN repo_id INTEGER REFERENCES audit_repos(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_artifacts' AND column_name = 'log_id') THEN
          ALTER TABLE audit_artifacts ADD COLUMN log_id BIGINT REFERENCES audit_logs(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_artifacts' AND column_name = 'storage_url') THEN
          ALTER TABLE audit_artifacts ADD COLUMN storage_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_artifacts' AND column_name = 'checksum') THEN
          ALTER TABLE audit_artifacts ADD COLUMN checksum TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_artifacts' AND column_name = 'size_bytes') THEN
          ALTER TABLE audit_artifacts ADD COLUMN size_bytes BIGINT;
        END IF;
      END $$;
    `);

    // Criar índices (com verificação de existência de colunas)
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'repo_id') THEN
          CREATE INDEX IF NOT EXISTS idx_audit_logs_repo_created_at ON audit_logs (repo_id, created_at DESC);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'action') THEN
          CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
        END IF;
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_artifacts' AND column_name = 'repo_id') THEN
          CREATE INDEX IF NOT EXISTS idx_audit_artifacts_repo_created_at ON audit_artifacts (repo_id, created_at DESC);
        END IF;
      END $$;
    `);
    
    // Índice único para repos
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_repos_provider_owner_repo ON audit_repos (provider, owner, repo);
    `);
  } catch (error) {
    console.error('[AUDIT] Schema migration error:', error);
    // Não propagar o erro - deixar o sistema funcionar mesmo sem persistência completa
  }
}

async function upsertRepo(repo?: AuditRepo): Promise<number | null> {
  if (!repo) return null;
  const client = getPool();
  if (!client) return null;
  const { provider = 'github', owner, repo: repoName, default_branch } = repo;
  const res = await client.query(
    `INSERT INTO audit_repos (provider, owner, repo, default_branch)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, owner, repo) DO UPDATE SET default_branch = EXCLUDED.default_branch
     RETURNING id`,
    [provider, owner, repoName, default_branch || null]
  );
  return res.rows[0]?.id as number;
}

export async function logEvent(input: AuditLogInput) {
  await ensureSchema();
  const safeMetadata = input.metadata ? sanitizeMetadata(input.metadata) : null;
  let id: number;
  const client = getPool();
  if (client) {
    const repoId = await upsertRepo(input.repo);
    const res = await client.query(
      `INSERT INTO audit_logs (repo_id, actor, action, severity, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [repoId || null, input.actor || null, input.action, input.severity || 'info', input.message || null, safeMetadata]
    );
    id = res.rows[0]?.id as number;
  } else {
    id = memoryId++;
  }

  inMemoryLogs.unshift({ ...input, id, created_at: new Date().toISOString(), metadata: safeMetadata || undefined });
  if (inMemoryLogs.length > 200) inMemoryLogs.splice(200);
  return id;
}

// Record structured evidence as a single audit log with normalized metadata
export async function recordAuditEvidence(evidence: AuditEvidenceInput) {
  const highestFinding = (evidence.findings || []).reduce<'info' | 'warn' | 'error'>((acc, f) => {
    if (f.severity === 'critical' || f.severity === 'high') return 'error';
    if (f.severity === 'medium') return acc === 'error' ? 'error' : 'warn';
    return acc;
  }, 'info');

  const metadata: Record<string, unknown> = {
    scope: evidence.scope,
    repo: evidence.repo,
    commands: evidence.commands,
    diffs: evidence.diffs?.map((d) => ({ summary: d.summary, files: d.files, prUrl: d.prUrl, patch: d.patch })),
    tests: evidence.tests,
    findings: evidence.findings,
    approval: evidence.approval,
    rollbackPlan: evidence.rollbackPlan,
  };

  const logId = await logEvent({
    actor: evidence.actor,
    action: 'audit.evidence',
    severity: highestFinding,
    message: evidence.message || 'Structured evidence recorded',
    metadata,
    repo: evidence.repo,
  });

  // For DB-backed storage, attach artifacts referencing the evidence log
  if (evidence.commands?.length) {
    await logArtifact({ logId, kind: 'commands', sizeBytes: evidence.commands.length });
  }
  if (evidence.diffs?.length) {
    await logArtifact({ logId, kind: 'diffs', sizeBytes: evidence.diffs.length });
  }
  if (evidence.tests?.length) {
    await logArtifact({ logId, kind: 'tests', sizeBytes: evidence.tests.length });
  }
  if (evidence.findings?.length) {
    await logArtifact({ logId, kind: 'findings', sizeBytes: evidence.findings.length });
  }
  if (evidence.approval) {
    await logArtifact({ logId, kind: 'approval', sizeBytes: 1 });
  }
  if (evidence.rollbackPlan) {
    await logArtifact({ logId, kind: 'rollback-plan', sizeBytes: evidence.rollbackPlan.length });
  }

  return logId;
}

export type AuditLogRecord = AuditLogInput & {
  id: number;
  created_at: string;
};

export async function fetchAuditLogs(filters?: {
  severity?: AuditSeverity;
  action?: string;
  since?: string; // ISO date string
  limit?: number;
  repoOwner?: string;
  repo?: string;
}): Promise<AuditLogRecord[]> {
  await ensureSchema();
  const limit = Math.min(Math.max(filters?.limit ?? 200, 1), 1000);
  const client = getPool();

  // Persistent mode: query database with filters
  if (client) {
    const clauses: string[] = [];
    const params: Array<string | Date | number> = [];
    let idx = 1;

    if (filters?.severity) {
      clauses.push(`l.severity = $${idx++}`);
      params.push(filters.severity);
    }
    if (filters?.action) {
      clauses.push(`l.action ILIKE $${idx++}`);
      params.push(`%${filters.action}%`);
    }
    if (filters?.since) {
      const sinceDate = new Date(filters.since);
      if (!isNaN(sinceDate.getTime())) {
        clauses.push(`l.created_at >= $${idx++}`);
        params.push(sinceDate);
      }
    }
    if (filters?.repoOwner) {
      clauses.push(`r.owner = $${idx++}`);
      params.push(filters.repoOwner);
    }
    if (filters?.repo) {
      clauses.push(`r.repo = $${idx++}`);
      params.push(filters.repo);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const sql = `
      SELECT l.id, l.actor, l.action, l.severity, l.message, l.metadata, l.created_at,
             r.provider, r.owner, r.repo, r.default_branch
      FROM audit_logs l
      LEFT JOIN audit_repos r ON l.repo_id = r.id
      ${where}
      ORDER BY l.created_at DESC
      LIMIT ${limit}
    `;

    const res = await client.query(sql, params);
    return res.rows.map((row) => ({
      id: Number(row.id),
      actor: row.actor ?? undefined,
      action: row.action,
      severity: row.severity as AuditSeverity,
      message: row.message ?? undefined,
      metadata: row.metadata ?? undefined,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      repo: row.repo
        ? {
            provider: row.provider || 'github',
            owner: row.owner,
            repo: row.repo,
            default_branch: row.default_branch ?? undefined,
          }
        : undefined,
    }));
  }

  // In-memory fallback
  let logs = [...inMemoryLogs];
  if (filters?.severity) logs = logs.filter((l) => l.severity === filters.severity);
  if (filters?.action) {
    const needle = filters.action.toLowerCase();
    logs = logs.filter((l) => (l.action || '').toLowerCase().includes(needle));
  }
  if (filters?.since) {
    const sinceDate = new Date(filters.since);
    if (!isNaN(sinceDate.getTime())) {
      logs = logs.filter((l) => new Date(l.created_at) >= sinceDate);
    }
  }
  if (filters?.repoOwner) {
    logs = logs.filter((l) => l.repo?.owner === filters.repoOwner);
  }
  if (filters?.repo) {
    logs = logs.filter((l) => l.repo?.repo === filters.repo);
  }

  return logs.slice(0, limit);
}

export async function logArtifact(input: AuditArtifactInput) {
  await ensureSchema();
  let id: number;
  const client = getPool();
  if (client) {
    const repoId = await upsertRepo(input.repo);
    const res = await client.query(
      `INSERT INTO audit_artifacts (repo_id, log_id, kind, storage_url, checksum, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [repoId || null, input.logId || null, input.kind, input.storageUrl || null, input.checksum || null, input.sizeBytes || null]
    );
    id = res.rows[0]?.id as number;
  } else {
    id = memoryId++;
  }

  inMemoryArtifacts.unshift({ ...input, id, created_at: new Date().toISOString() });
  if (inMemoryArtifacts.length > 200) inMemoryArtifacts.splice(200);
  return id;
}

export function getAuditSnapshot(limit = 100) {
  return {
    logs: inMemoryLogs.slice(0, limit),
    artifacts: inMemoryArtifacts.slice(0, limit),
  };
}

export function resetAuditMemory() {
  inMemoryLogs.length = 0;
  inMemoryArtifacts.length = 0;
  memoryId = 1;
}

function signPayload(payload: unknown, key: string) {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

export function exportEvidenceBundle(options?: { format?: 'soc2' | 'iso'; scope?: string }) {
  const format = options?.format || 'soc2';
  const scope = options?.scope || 'legacyguard';
  const generatedAt = new Date().toISOString();
  const snapshot = getAuditSnapshot(150);
  const bundle = {
    format,
    scope,
    generatedAt,
    logs: snapshot.logs,
    artifacts: snapshot.artifacts,
  };
  const signingKey = process.env.AUDIT_SIGNING_KEY || 'legacyguard-dev-key';
  const signature = signPayload(bundle, signingKey);
  return { ...bundle, signature, signer: 'legacyguard-hmac-sha256' };
}
