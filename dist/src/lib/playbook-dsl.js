"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePlaybook = parsePlaybook;
function parseKeyVals(body) {
    const params = {};
    body
        .split(/\s+/)
        .filter(Boolean)
        .forEach((chunk) => {
        const [k, ...rest] = chunk.split(':');
        if (k && rest.length > 0)
            params[k.trim()] = rest.join(':').trim();
    });
    return params;
}
function normalizeName(input, idx) {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : `step-${idx + 1}`;
}
function parsePlaybook(dsl) {
    const raw = dsl || '';
    const lines = raw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    // Tentativa de JSON para quem preferir formato estruturado
    if (raw.trim().startsWith('{')) {
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed.steps))
                throw new Error('steps ausente');
            const steps = parsed.steps.map((s, idx) => ({
                name: normalizeName(s.name || '', idx),
                action: String(s.action || ''),
                guardrails: Array.isArray(s.guardrails) ? s.guardrails.map(String) : undefined,
                params: typeof s.params === 'object' && s.params ? s.params : undefined,
            }));
            return {
                name: parsed.name || 'playbook',
                version: parsed.version || '0.1.0',
                steps,
                raw,
            };
        }
        catch (err) {
            throw new Error(`Playbook JSON inválido: ${err instanceof Error ? err.message : err}`);
        }
    }
    const steps = [];
    lines.forEach((line, idx) => {
        if (!line.startsWith('-'))
            return;
        const body = line.replace(/^-\s*/, '');
        const [actionPart, ...rest] = body.split('|');
        const action = actionPart === null || actionPart === void 0 ? void 0 : actionPart.trim();
        if (!action)
            return;
        const params = parseKeyVals(rest.join(' '));
        const guardrailsRaw = params.guardrails || params.guards;
        const guardrails = guardrailsRaw ? guardrailsRaw.split(',').map((g) => g.trim()).filter(Boolean) : undefined;
        delete params.guardrails;
        delete params.guards;
        steps.push({
            name: normalizeName(params.name || '', idx),
            action,
            guardrails,
            params: Object.keys(params).length ? params : undefined,
        });
    });
    if (steps.length === 0) {
        throw new Error('Nenhum passo encontrado no playbook');
    }
    return {
        name: 'playbook-dsl',
        version: '0.1.0',
        steps,
        raw,
    };
}
