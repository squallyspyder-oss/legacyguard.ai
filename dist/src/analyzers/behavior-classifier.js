"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyBehavior = classifyBehavior;
function classifyBehavior(profile) {
    const behaviors = [];
    const reasons = [];
    if (profile.signals.crypto) {
        behaviors.push('crypto');
        reasons.push('Uso de crypto detectado');
    }
    if (profile.signals.network) {
        behaviors.push('network-client');
        reasons.push('Chamadas de rede detectadas');
    }
    if (profile.signals.filesystem) {
        behaviors.push('filesystem');
        reasons.push('Acesso a filesystem');
    }
    if (profile.signals.exec) {
        behaviors.push('exec');
        reasons.push('Execução de processos');
    }
    if (profile.signals.obfuscation) {
        behaviors.push('obfuscation');
        reasons.push('Padrões de ofuscação');
    }
    const hasSecrets = profile.suspiciousStrings.length > 0;
    if (hasSecrets) {
        behaviors.push('secrets-risk');
        reasons.push('Strings sensíveis encontradas');
    }
    let risk = 'low';
    const highSignals = profile.signals.exec || profile.signals.obfuscation;
    const mediumSignals = profile.signals.network || profile.signals.filesystem || hasSecrets;
    if (highSignals)
        risk = 'high';
    else if (mediumSignals)
        risk = 'medium';
    return {
        behaviors: Array.from(new Set(behaviors)),
        risk,
        reasons,
    };
}
