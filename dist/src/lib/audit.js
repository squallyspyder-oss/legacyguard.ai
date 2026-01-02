"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuditPersistent = isAuditPersistent;
exports.getAuditStorageStatus = getAuditStorageStatus;
exports.logEvent = logEvent;
exports.recordAuditEvidence = recordAuditEvidence;
exports.fetchAuditLogs = fetchAuditLogs;
exports.logArtifact = logArtifact;
exports.getAuditSnapshot = getAuditSnapshot;
exports.resetAuditMemory = resetAuditMemory;
exports.exportEvidenceBundle = exportEvidenceBundle;
const pg_1 = require("pg");
const crypto_1 = __importDefault(require("crypto"));
const secrets_1 = require("./secrets");
let pool = null;
const inMemoryLogs = [];
const inMemoryArtifacts = [];
let memoryId = 1;
// Track if warning was already logged
let dbWarningLogged = false;
function getPool() {
    if (pool)
        return pool;
    const url = process.env.AUDIT_DB_URL || process.env.PGVECTOR_URL;
    if (!url) {
        // Fallback to in-memory - warn in production
        if (!dbWarningLogged && process.env.NODE_ENV === 'production') {
            console.warn('⚠️  [AUDIT] AUDIT_DB_URL not configured! Audit logs are stored in-memory and will be LOST on restart.\n' +
                '    Set AUDIT_DB_URL or PGVECTOR_URL environment variable for persistent audit logging.');
            dbWarningLogged = true;
        }
        return null;
    }
    pool = new pg_1.Pool({ connectionString: url });
    return pool;
}
/** Check if audit is using persistent storage */
function isAuditPersistent() {
    return !!(process.env.AUDIT_DB_URL || process.env.PGVECTOR_URL);
}
/** Get audit storage status for health checks */
function getAuditStorageStatus() {
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
    if (!client)
        return; // modo memória
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
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

    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      repo_id INTEGER REFERENCES audit_repos(id) ON DELETE SET NULL,
      actor TEXT,
      action TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      message TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_artifacts (
      id BIGSERIAL PRIMARY KEY,
      repo_id INTEGER REFERENCES audit_repos(id) ON DELETE SET NULL,
      log_id BIGINT REFERENCES audit_logs(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      storage_url TEXT,
      checksum TEXT,
      size_bytes BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_repo_created_at ON audit_logs (repo_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
    CREATE INDEX IF NOT EXISTS idx_audit_artifacts_repo_created_at ON audit_artifacts (repo_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_repos_provider_owner_repo ON audit_repos (provider, owner, repo);
  `);
}
async function upsertRepo(repo) {
    var _a;
    if (!repo)
        return null;
    const client = getPool();
    if (!client)
        return null;
    const { provider = 'github', owner, repo: repoName, default_branch } = repo;
    const res = await client.query(`INSERT INTO audit_repos (provider, owner, repo, default_branch)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, owner, repo) DO UPDATE SET default_branch = EXCLUDED.default_branch
     RETURNING id`, [provider, owner, repoName, default_branch || null]);
    return (_a = res.rows[0]) === null || _a === void 0 ? void 0 : _a.id;
}
async function logEvent(input) {
    var _a;
    await ensureSchema();
    const safeMetadata = input.metadata ? (0, secrets_1.sanitizeMetadata)(input.metadata) : null;
    let id;
    const client = getPool();
    if (client) {
        const repoId = await upsertRepo(input.repo);
        const res = await client.query(`INSERT INTO audit_logs (repo_id, actor, action, severity, message, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`, [repoId || null, input.actor || null, input.action, input.severity || 'info', input.message || null, safeMetadata]);
        id = (_a = res.rows[0]) === null || _a === void 0 ? void 0 : _a.id;
    }
    else {
        id = memoryId++;
    }
    inMemoryLogs.unshift({ ...input, id, created_at: new Date().toISOString(), metadata: safeMetadata || undefined });
    if (inMemoryLogs.length > 200)
        inMemoryLogs.splice(200);
    return id;
}
// Record structured evidence as a single audit log with normalized metadata
async function recordAuditEvidence(evidence) {
    var _a, _b, _c, _d, _e;
    const highestFinding = (evidence.findings || []).reduce((acc, f) => {
        if (f.severity === 'critical' || f.severity === 'high')
            return 'error';
        if (f.severity === 'medium')
            return acc === 'error' ? 'error' : 'warn';
        return acc;
    }, 'info');
    const metadata = {
        scope: evidence.scope,
        repo: evidence.repo,
        commands: evidence.commands,
        diffs: (_a = evidence.diffs) === null || _a === void 0 ? void 0 : _a.map((d) => ({ summary: d.summary, files: d.files, prUrl: d.prUrl, patch: d.patch })),
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
    if ((_b = evidence.commands) === null || _b === void 0 ? void 0 : _b.length) {
        await logArtifact({ logId, kind: 'commands', sizeBytes: evidence.commands.length });
    }
    if ((_c = evidence.diffs) === null || _c === void 0 ? void 0 : _c.length) {
        await logArtifact({ logId, kind: 'diffs', sizeBytes: evidence.diffs.length });
    }
    if ((_d = evidence.tests) === null || _d === void 0 ? void 0 : _d.length) {
        await logArtifact({ logId, kind: 'tests', sizeBytes: evidence.tests.length });
    }
    if ((_e = evidence.findings) === null || _e === void 0 ? void 0 : _e.length) {
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
async function fetchAuditLogs(filters) {
    var _a;
    await ensureSchema();
    const limit = Math.min(Math.max((_a = filters === null || filters === void 0 ? void 0 : filters.limit) !== null && _a !== void 0 ? _a : 200, 1), 1000);
    const client = getPool();
    // Persistent mode: query database with filters
    if (client) {
        const clauses = [];
        const params = [];
        let idx = 1;
        if (filters === null || filters === void 0 ? void 0 : filters.severity) {
            clauses.push(`l.severity = $${idx++}`);
            params.push(filters.severity);
        }
        if (filters === null || filters === void 0 ? void 0 : filters.action) {
            clauses.push(`l.action ILIKE $${idx++}`);
            params.push(`%${filters.action}%`);
        }
        if (filters === null || filters === void 0 ? void 0 : filters.since) {
            const sinceDate = new Date(filters.since);
            if (!isNaN(sinceDate.getTime())) {
                clauses.push(`l.created_at >= $${idx++}`);
                params.push(sinceDate);
            }
        }
        if (filters === null || filters === void 0 ? void 0 : filters.repoOwner) {
            clauses.push(`r.owner = $${idx++}`);
            params.push(filters.repoOwner);
        }
        if (filters === null || filters === void 0 ? void 0 : filters.repo) {
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
        return res.rows.map((row) => {
            var _a, _b, _c, _d;
            return ({
                id: Number(row.id),
                actor: (_a = row.actor) !== null && _a !== void 0 ? _a : undefined,
                action: row.action,
                severity: row.severity,
                message: (_b = row.message) !== null && _b !== void 0 ? _b : undefined,
                metadata: (_c = row.metadata) !== null && _c !== void 0 ? _c : undefined,
                created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
                repo: row.repo
                    ? {
                        provider: row.provider || 'github',
                        owner: row.owner,
                        repo: row.repo,
                        default_branch: (_d = row.default_branch) !== null && _d !== void 0 ? _d : undefined,
                    }
                    : undefined,
            });
        });
    }
    // In-memory fallback
    let logs = [...inMemoryLogs];
    if (filters === null || filters === void 0 ? void 0 : filters.severity)
        logs = logs.filter((l) => l.severity === filters.severity);
    if (filters === null || filters === void 0 ? void 0 : filters.action) {
        const needle = filters.action.toLowerCase();
        logs = logs.filter((l) => (l.action || '').toLowerCase().includes(needle));
    }
    if (filters === null || filters === void 0 ? void 0 : filters.since) {
        const sinceDate = new Date(filters.since);
        if (!isNaN(sinceDate.getTime())) {
            logs = logs.filter((l) => new Date(l.created_at) >= sinceDate);
        }
    }
    if (filters === null || filters === void 0 ? void 0 : filters.repoOwner) {
        logs = logs.filter((l) => { var _a; return ((_a = l.repo) === null || _a === void 0 ? void 0 : _a.owner) === filters.repoOwner; });
    }
    if (filters === null || filters === void 0 ? void 0 : filters.repo) {
        logs = logs.filter((l) => { var _a; return ((_a = l.repo) === null || _a === void 0 ? void 0 : _a.repo) === filters.repo; });
    }
    return logs.slice(0, limit);
}
async function logArtifact(input) {
    var _a;
    await ensureSchema();
    let id;
    const client = getPool();
    if (client) {
        const repoId = await upsertRepo(input.repo);
        const res = await client.query(`INSERT INTO audit_artifacts (repo_id, log_id, kind, storage_url, checksum, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`, [repoId || null, input.logId || null, input.kind, input.storageUrl || null, input.checksum || null, input.sizeBytes || null]);
        id = (_a = res.rows[0]) === null || _a === void 0 ? void 0 : _a.id;
    }
    else {
        id = memoryId++;
    }
    inMemoryArtifacts.unshift({ ...input, id, created_at: new Date().toISOString() });
    if (inMemoryArtifacts.length > 200)
        inMemoryArtifacts.splice(200);
    return id;
}
function getAuditSnapshot(limit = 100) {
    return {
        logs: inMemoryLogs.slice(0, limit),
        artifacts: inMemoryArtifacts.slice(0, limit),
    };
}
function resetAuditMemory() {
    inMemoryLogs.length = 0;
    inMemoryArtifacts.length = 0;
    memoryId = 1;
}
function signPayload(payload, key) {
    const hmac = crypto_1.default.createHmac('sha256', key);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
}
function exportEvidenceBundle(options) {
    const format = (options === null || options === void 0 ? void 0 : options.format) || 'soc2';
    const scope = (options === null || options === void 0 ? void 0 : options.scope) || 'legacyguard';
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
