"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runChat = runChat;
const openai_1 = __importDefault(require("openai"));
const pricing_1 = require("../lib/pricing");
const intent_detector_1 = require("../lib/intent-detector");
// Sinais fortes de necessidade de agentes (ação/execução) - legado, mantido para compatibilidade
const ACTION_REGEX = /(aplica(r)?|patch|pr\b|pull request|merge|deploy|commit|test(e|ar)?|corrig(e|ir)|fix|ajustar|refator|automatiza|executa|rodar? testes|cria(r)? plano|orquestra)/i;
async function runChat(input) {
    var _a, _b, _c, _d, _e, _f, _g;
    const cheapModel = process.env.OPENAI_CHEAP_MODEL || 'gpt-4o-mini';
    const deepModel = process.env.OPENAI_DEEP_MODEL || 'gpt-4o';
    const model = input.deep ? deepModel : cheapModel;
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    console.log('[chat] agent invoked', { deep: !!input.deep });
    // Detectar intenção do usuário ("vibe code")
    const intentDetection = (0, intent_detector_1.detectIntent)(input.message, input.currentMode);
    const modeChangeRequest = (0, intent_detector_1.detectModeChangeRequest)(input.message);
    console.log('[chat] intent detection', {
        intent: intentDetection.intent,
        confidence: intentDetection.confidence,
        suggestedMode: intentDetection.suggestedMode,
        modeChangeRequest: modeChangeRequest.wantsChange,
    });
    const system = input.deep
        ? `Você é o modo Chat Livre (profundo) do LegacyGuard. Responda de forma objetiva, traga riscos, opções e próximos passos. Quando perceber intenção de execução (patch, PR, merge, testes, deploy), recomende orquestrar agentes.`
        : `Você é o modo econômico de Chat Livre do LegacyGuard. Seja conciso e barato. Somente orientação; sem passos executáveis. Se detectar necessidade de agentes para patch/PR/merge/testes/refatoração, recomende orquestrar.`;
    const needsAction = ACTION_REGEX.test(input.message || '');
    let reply = '';
    let usageInfo = undefined;
    try {
        const messages = [
            { role: 'system', content: system },
            { role: 'user', content: input.message },
        ];
        console.log('[chat] calling LLM', { model });
        const completion = await openai.chat.completions.create({
            model,
            temperature: input.deep ? 0.35 : 0.5,
            messages,
        });
        reply = ((_c = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) === null || _c === void 0 ? void 0 : _c.trim()) || 'Sem resposta.';
        const promptTokens = (_e = (_d = completion.usage) === null || _d === void 0 ? void 0 : _d.prompt_tokens) !== null && _e !== void 0 ? _e : 0;
        const completionTokens = (_g = (_f = completion.usage) === null || _f === void 0 ? void 0 : _f.completion_tokens) !== null && _g !== void 0 ? _g : 0;
        const totalTokens = promptTokens + completionTokens;
        const cost = (0, pricing_1.estimateCostUSD)({ model, promptTokens, completionTokens });
        usageInfo = {
            promptTokens,
            completionTokens,
            totalTokens,
            usdEstimate: cost.usd,
        };
    }
    catch (err) {
        console.error('[chat] LLM error', err);
        throw new Error(`OpenAI chat failed: ${(err === null || err === void 0 ? void 0 : err.message) || err}`);
    }
    // Gerar sugestão de mudança de modo se apropriado
    const modeSuggestion = intentDetection.shouldPromptUser
        ? (0, intent_detector_1.formatSuggestion)(intentDetection)
        : undefined;
    return {
        reply,
        suggestOrchestrate: needsAction || intentDetection.intent !== 'research',
        costTier: input.deep ? 'deep' : 'cheap',
        modelUsed: model,
        usage: usageInfo,
        intentDetection,
        modeSuggestion,
    };
}
