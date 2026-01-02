"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startIncidentCycle = startIncidentCycle;
exports.markMitigation = markMitigation;
exports.recordRegression = recordRegression;
exports.getIncident = getIncident;
exports.getMetricsSummary = getMetricsSummary;
exports.resetMetrics = resetMetrics;
const incidents = new Map();
function median(values) {
    if (values.length === 0)
        return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
}
function startIncidentCycle(id, source, startedAt = Date.now()) {
    if (!id)
        throw new Error('incident id obrigatório');
    const existing = incidents.get(id);
    if (existing)
        return existing;
    const created = {
        id,
        source,
        startedAt,
        status: 'open',
        regressions: 0,
        notes: [],
    };
    incidents.set(id, created);
    return created;
}
function markMitigation(id, status = 'mitigated', when = Date.now()) {
    if (!id)
        throw new Error('incident id obrigatório');
    const incident = incidents.get(id) || startIncidentCycle(id);
    incident.status = status;
    if (status === 'mitigated') {
        incident.mitigatedAt = when;
    }
    incidents.set(id, incident);
    return incident;
}
function recordRegression(id, note) {
    if (!id)
        throw new Error('incident id obrigatório');
    const incident = incidents.get(id) || startIncidentCycle(id);
    incident.regressions += 1;
    if (note)
        incident.notes.push(note.slice(0, 500));
    incidents.set(id, incident);
    return incident;
}
function getIncident(id) {
    return incidents.get(id);
}
function getMetricsSummary() {
    const values = Array.from(incidents.values());
    const total = values.length;
    const mitigated = values.filter((v) => v.status === 'mitigated');
    const open = values.filter((v) => v.status === 'open');
    const failed = values.filter((v) => v.status === 'failed');
    const mttrList = mitigated
        .filter((v) => typeof v.mitigatedAt === 'number')
        .map((v) => v.mitigatedAt - v.startedAt)
        .filter((v) => v >= 0);
    const mttrAvg = mttrList.length ? Math.round(mttrList.reduce((a, b) => a + b, 0) / mttrList.length) : 0;
    const mttrP50 = median(mttrList);
    const regressionsTotal = values.reduce((acc, v) => acc + v.regressions, 0);
    return {
        totals: {
            incidents: total,
            mitigated: mitigated.length,
            open: open.length,
            failed: failed.length,
        },
        mttr: {
            avgMs: mttrAvg,
            p50Ms: mttrP50,
            samples: mttrList.length,
        },
        regressions: {
            total: regressionsTotal,
            perIncident: total ? Number((regressionsTotal / total).toFixed(2)) : 0,
        },
    };
}
function resetMetrics() {
    incidents.clear();
}
