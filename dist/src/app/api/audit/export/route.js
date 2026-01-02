"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const audit_1 = require("@/lib/audit");
const rate_limit_1 = require("@/lib/rate-limit");
const rbac_1 = require("@/lib/rbac");
async function GET(req) {
    // Rate limit to avoid bulk downloads
    const rl = await (0, rate_limit_1.checkRateLimit)(req, { ...rate_limit_1.RATE_LIMIT_PRESETS.standard, keyPrefix: 'audit-export' });
    if (!rl.allowed) {
        return (0, rate_limit_1.rateLimitResponse)(rl.resetAt);
    }
    // RBAC
    const auth = await (0, rbac_1.requirePermission)('audit:export');
    if (!auth.authorized) {
        return auth.response;
    }
    const url = new URL(req.url);
    const format = (url.searchParams.get('format') || 'json').toLowerCase();
    // Backwards compatible bundle export (soc2/iso)
    if (format === 'soc2' || format === 'iso' || format === 'bundle') {
        const scope = url.searchParams.get('scope') || 'legacyguard';
        const bundle = (0, audit_1.exportEvidenceBundle)({ format: format === 'iso' ? 'iso' : 'soc2', scope });
        return server_1.NextResponse.json(bundle);
    }
    const severity = url.searchParams.get('severity') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const since = url.searchParams.get('since') || undefined;
    const limitParam = url.searchParams.get('limit');
    const repoOwner = url.searchParams.get('owner') || undefined;
    const repo = url.searchParams.get('repo') || undefined;
    const limit = limitParam ? Number(limitParam) : undefined;
    const logs = await (0, audit_1.fetchAuditLogs)({ severity, action, since, limit, repoOwner, repo });
    if (format === 'csv') {
        const rows = [];
        const headers = ['id', 'created_at', 'severity', 'action', 'actor', 'message', 'repo', 'metadata'];
        const escapeCsv = (val) => {
            const str = val === undefined || val === null ? '' : String(val);
            const clean = str.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
            return `"${clean}"`;
        };
        rows.push(headers.join(','));
        for (const log of logs) {
            const repoStr = log.repo ? `${log.repo.owner}/${log.repo.repo}` : '';
            rows.push([
                log.id,
                log.created_at,
                log.severity,
                log.action,
                log.actor || '',
                log.message || '',
                repoStr,
                log.metadata ? JSON.stringify(log.metadata) : '',
            ].map(escapeCsv).join(','));
        }
        const csv = rows.join('\n');
        const filename = `audit-export-${new Date().toISOString().slice(0, 10)}.csv`;
        return new server_1.NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    }
    // Default: JSON
    return server_1.NextResponse.json({ logs, count: logs.length, limit: limit !== null && limit !== void 0 ? limit : 200 });
}
