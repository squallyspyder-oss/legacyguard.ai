"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHarness = generateHarness;
function generateHarness(profile, behavior, incident) {
    const fixtures = [];
    const commands = [];
    if (incident.payload) {
        fixtures.push({ name: 'replay-incident-payload', input: incident.payload });
    }
    if (incident.stack) {
        fixtures.push({ name: 'stack-sanity', input: { stack: incident.stack } });
    }
    if (behavior.behaviors.includes('network-client')) {
        commands.push({ name: 'mock-network', command: 'DISABLE_NET=1 npm test', notes: 'Isolar chamadas externas' });
    }
    if (behavior.behaviors.includes('filesystem')) {
        commands.push({ name: 'fs-sandbox', command: 'SANDBOX_FS=1 npm test', notes: 'Bloquear escrita fora do sandbox' });
    }
    if (behavior.behaviors.includes('exec')) {
        commands.push({ name: 'block-exec', command: 'BLOCK_EXEC=1 npm test', notes: 'Desabilitar child_process' });
    }
    if (behavior.behaviors.includes('crypto')) {
        commands.push({ name: 'crypto-fuzz', command: 'npm test -- crypto', notes: 'Cobrir fluxos criptográficos' });
    }
    // fallback genérico
    if (commands.length === 0) {
        commands.push({ name: 'baseline-tests', command: 'npm test', notes: 'Smoke genérico' });
    }
    if (fixtures.length === 0) {
        fixtures.push({ name: 'placeholder-fixture', input: { note: 'sem dados do incidente' } });
    }
    return { fixtures, commands };
}
