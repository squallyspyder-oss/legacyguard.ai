"use strict";
/**
 * Intent Detector ("Vibe Code")
 *
 * Detecta automaticamente a intenção do usuário e sugere mudança de agente.
 * Reduz "poluição digital" ao evitar que o usuário precise escolher manualmente.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectIntent = detectIntent;
exports.detectModeChangeRequest = detectModeChangeRequest;
exports.formatSuggestion = formatSuggestion;
// Padrões de intenção com pesos
const INTENT_PATTERNS = {
    incident_reproduction: {
        patterns: [
            /\b(reproduz|reproduzir|reproducir|replicate|reproduce)\b/i,
            /\b(bug|incidente|incident|erro|error|falha|failure)\b.*\b(reproduz|acontec|ocorr)/i,
            /\b(quando|when).*\b(acontece|occurs|happens)\b/i,
            /\b(não funciona|não está funcionando|not working|doesn't work)\b/i,
            /\b(quebrou|broke|broken|crashou|crashed)\b/i,
            /\b(comportamento inesperado|unexpected behavior)\b/i,
            /\b(twin|digital twin|réplica)\b/i,
        ],
        agent: 'twin-builder',
        mode: 'legacyAssist',
        promptThreshold: 0.6,
    },
    code_fix: {
        patterns: [
            /\b(fix|corrig|arrum|consert|patch|resolver|resolve)\b/i,
            /\b(implementa|implement|criar|create|adiciona|add)\b.*\b(feature|funcionalidade|função)\b/i,
            /\b(refactor|refatorar|melhorar|improve)\b/i,
            /\b(atualiz|update|upgrade)\b.*\b(código|code|dependência|dependency)\b/i,
        ],
        agent: 'operator',
        mode: 'orchestrate',
        promptThreshold: 0.7,
    },
    code_review: {
        patterns: [
            /\b(revis|review|analis|analyze|verificar|verify|check)\b.*\b(código|code|pr|pull request)\b/i,
            /\b(qualidade|quality|segurança|security|compliance)\b/i,
            /\b(gdpr|soc2|owasp|pci)\b/i,
            /\b(code review|revisão de código)\b/i,
        ],
        agent: 'reviewer',
        mode: 'orchestrate',
        promptThreshold: 0.6,
    },
    code_analysis: {
        patterns: [
            /\b(analisa|analyze|entend|understand|explic|explain)\b.*\b(código|code|arquivo|file|projeto|project)\b/i,
            /\b(como funciona|how.*works|what does.*do)\b/i,
            /\b(dependen|import|referenc)\b/i,
            /\b(arquitetura|architecture|estrutura|structure)\b/i,
        ],
        agent: 'advisor',
        mode: 'orchestrate',
        promptThreshold: 0.5,
    },
    pr_merge: {
        patterns: [
            /\b(merge|mergear|mesclar)\b.*\b(pr|pull request)\b/i,
            /\b(aprovar|approve)\b.*\b(pr|pull request)\b/i,
            /\b(fechar|close|finalizar|finalize)\b.*\b(pr|pull request)\b/i,
        ],
        agent: 'executor',
        mode: 'orchestrate',
        promptThreshold: 0.8, // Alto threshold - operação crítica
    },
    research: {
        patterns: [
            /\b(o que é|what is|como|how to|por que|why|quando|when)\b/i,
            /\b(pesquis|search|busca|find|procur)\b/i,
            /\b(ideia|idea|sugest|suggest|brainstorm)\b/i,
            /\b(ajuda|help|dúvida|doubt|pergunta|question)\b/i,
        ],
        agent: 'chat',
        mode: 'chat',
        promptThreshold: 0.3, // Baixo threshold - operação segura
    },
    unknown: {
        patterns: [],
        agent: 'chat',
        mode: 'chat',
        promptThreshold: 1.0,
    },
};
// Palavras que indicam urgência/ação (aumentam confidence)
const ACTION_BOOSTERS = [
    /\b(urgente|urgent|agora|now|imediato|immediate|rápido|quick|fast)\b/i,
    /\b(por favor|please|preciso|need|quero|want)\b/i,
    /\b(fazer|do|executar|execute|rodar|run)\b/i,
];
// Palavras que indicam dúvida (diminuem confidence)
const DOUBT_REDUCERS = [
    /\b(talvez|maybe|perhaps|não sei|don't know|acho que|i think)\b/i,
    /\b(será que|could|would|might)\b/i,
    /\?\s*$/, // Termina com interrogação
];
/**
 * Detecta a intenção do usuário baseado na mensagem
 */
function detectIntent(message, currentMode) {
    const normalizedMessage = message.toLowerCase().trim();
    let bestIntent = 'unknown';
    let bestScore = 0;
    let matchedKeywords = [];
    // Verificar cada padrão de intenção
    for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
        if (intent === 'unknown')
            continue;
        let score = 0;
        const keywords = [];
        for (const pattern of config.patterns) {
            const match = normalizedMessage.match(pattern);
            if (match) {
                score += 0.3; // Base score por match
                keywords.push(match[0]);
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestIntent = intent;
            matchedKeywords = keywords;
        }
    }
    // Aplicar boosters e reducers
    let confidence = Math.min(bestScore, 1.0);
    for (const booster of ACTION_BOOSTERS) {
        if (booster.test(normalizedMessage)) {
            confidence = Math.min(confidence + 0.15, 1.0);
        }
    }
    for (const reducer of DOUBT_REDUCERS) {
        if (reducer.test(normalizedMessage)) {
            confidence = Math.max(confidence - 0.2, 0);
        }
    }
    // Se não encontrou nada, assume research/chat
    if (bestIntent === 'unknown' || confidence < 0.2) {
        return {
            intent: 'research',
            confidence: 0.5,
            suggestedAgent: 'chat',
            suggestedMode: 'chat',
            reason: 'Nenhuma intenção específica detectada. Modo chat é mais flexível.',
            shouldPromptUser: false,
            keywords: [],
        };
    }
    const config = INTENT_PATTERNS[bestIntent];
    const shouldPromptUser = confidence < config.promptThreshold ||
        Boolean(currentMode && currentMode !== config.mode);
    return {
        intent: bestIntent,
        confidence,
        suggestedAgent: config.agent,
        suggestedMode: config.mode,
        reason: generateReason(bestIntent, matchedKeywords),
        shouldPromptUser,
        keywords: matchedKeywords,
    };
}
/**
 * Gera explicação humana para a sugestão
 */
function generateReason(intent, keywords) {
    const keywordList = keywords.slice(0, 3).map(k => `"${k}"`).join(', ');
    switch (intent) {
        case 'incident_reproduction':
            return `Detectei que você quer reproduzir um problema (${keywordList}). O Twin Builder pode criar uma réplica digital do incidente.`;
        case 'code_fix':
            return `Parece que você quer corrigir código (${keywordList}). O Orquestrador vai coordenar análise, correção e revisão.`;
        case 'code_review':
            return `Você quer revisar código (${keywordList}). O Reviewer vai analisar qualidade, segurança e compliance.`;
        case 'code_analysis':
            return `Você quer entender código (${keywordList}). O Advisor vai analisar e explicar.`;
        case 'pr_merge':
            return `Você quer fazer merge de PR (${keywordList}). O Executor pode fazer isso (com aprovação).`;
        case 'research':
            return `Parece uma pergunta ou pesquisa (${keywordList}). O Chat é ideal para isso.`;
        default:
            return 'Não consegui identificar a intenção com certeza.';
    }
}
/**
 * Verifica se a mensagem indica desejo de mudar de modo
 */
function detectModeChangeRequest(message) {
    const patterns = [
        { regex: /\b(muda|troca|switch|change)\b.*\b(para|to|for)\b.*\b(legacyassist|twin|incidente)\b/i, mode: 'legacyAssist', agent: 'twin-builder' },
        { regex: /\b(muda|troca|switch|change)\b.*\b(para|to|for)\b.*\b(chat|conversa)\b/i, mode: 'chat', agent: 'chat' },
        { regex: /\b(muda|troca|switch|change)\b.*\b(para|to|for)\b.*\b(orquestrador|orchestrat)\b/i, mode: 'orchestrate', agent: 'orchestrator' },
        { regex: /\b(usa|use)\b.*\b(twin builder|legacyassist)\b/i, mode: 'legacyAssist', agent: 'twin-builder' },
        { regex: /\b(usa|use)\b.*\b(chat)\b/i, mode: 'chat', agent: 'chat' },
        { regex: /\b(usa|use)\b.*\b(orquestrador|orchestrat)\b/i, mode: 'orchestrate', agent: 'orchestrator' },
    ];
    for (const { regex, mode, agent } of patterns) {
        if (regex.test(message)) {
            return { wantsChange: true, targetMode: mode, targetAgent: agent };
        }
    }
    return { wantsChange: false };
}
/**
 * Gera sugestão amigável para o usuário
 */
function formatSuggestion(result) {
    if (!result.shouldPromptUser) {
        return '';
    }
    const confidenceLabel = result.confidence > 0.8 ? '🟢' :
        result.confidence > 0.5 ? '🟡' :
            '🟠';
    return `${confidenceLabel} **Sugestão**: ${result.reason}\n\n` +
        `Quer que eu mude para o modo **${result.suggestedMode}**? ` +
        `(Confiança: ${Math.round(result.confidence * 100)}%)`;
}
const intentDetector = { detectIntent, detectModeChangeRequest, formatSuggestion };
exports.default = intentDetector;
