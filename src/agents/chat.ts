import OpenAI from 'openai';
import { estimateCostUSD } from '../lib/pricing';
import { detectIntent, detectModeChangeRequest, formatSuggestion, type IntentDetectionResult } from '../lib/intent-detector';
import { buildSystemPrompt, LEGACYGUARD_COMPACT_CONTEXT } from '../lib/system-context';

// Sinais fortes de necessidade de agentes (ação/execução) - legado, mantido para compatibilidade
const ACTION_REGEX = /(aplica(r)?|patch|pr\b|pull request|merge|deploy|commit|test(e|ar)?|corrig(e|ir)|fix|ajustar|refator|automatiza|executa|rodar? testes|cria(r)? plano|orquestra)/i;

type ChatOutput = {
  reply: string;
  suggestOrchestrate: boolean;
  costTier: 'cheap' | 'deep';
  modelUsed: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    usdEstimate: number;
  };
  // Novo: detecção de intenção ("vibe code")
  intentDetection?: IntentDetectionResult;
  modeSuggestion?: string;  // Texto formatado para mostrar ao usuário
};

export async function runChat(input: {
  message: string;
  deep?: boolean;
  repoPath?: string;
  context?: string;
  currentMode?: string;  // Modo atual para comparar
}): Promise<ChatOutput> {
  const cheapModel = process.env.OPENAI_CHEAP_MODEL || 'gpt-4o-mini';
  const deepModel = process.env.OPENAI_DEEP_MODEL || 'gpt-4o';
  const model = input.deep ? deepModel : cheapModel;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('[chat] agent invoked', { deep: !!input.deep });

  // Detectar intenção do usuário ("vibe code")
  const intentDetection = detectIntent(input.message, input.currentMode);
  const modeChangeRequest = detectModeChangeRequest(input.message);
  
  console.log('[chat] intent detection', { 
    intent: intentDetection.intent, 
    confidence: intentDetection.confidence,
    suggestedMode: intentDetection.suggestedMode,
    modeChangeRequest: modeChangeRequest.wantsChange,
  });

  // Sistema de prompts melhorado com contexto completo do LegacyGuard
  const system = input.deep
    ? buildSystemPrompt({
        agentName: 'LegacyAssist',
        agentRole: 'Assistente conversacional principal do LegacyGuard. Você ajuda desenvolvedores a entender, manter e modernizar código legado de forma segura.',
        mode: 'full',
        capabilities: [
          'Responder dúvidas sobre código, arquitetura e boas práticas',
          'Orientar sobre qual modo/agente usar para cada situação',
          'Explicar conceitos de refatoração e modernização',
          'Sugerir estratégias de migração e testes',
          'Recomendar orquestração quando detectar necessidade de execução',
        ],
        additionalContext: input.context ? `Contexto do repositório:\n${input.context}` : undefined,
      }) + `\n\nQuando perceber intenção de execução (patch, PR, merge, testes, deploy), recomende usar o Orchestrator.`
    : buildSystemPrompt({
        agentName: 'LegacyAssist (Modo Econômico)',
        agentRole: 'Assistente rápido e conciso para dúvidas simples.',
        mode: 'compact',
        capabilities: [
          'Respostas diretas e objetivas',
          'Orientação básica sem execução',
          'Encaminhar para modo profundo quando necessário',
        ],
      }) + `\n\nSeja conciso. Se detectar necessidade de análise profunda ou execução, sugira mudar de modo.`;

  const needsAction = ACTION_REGEX.test(input.message || '');

  let reply = '';
  let usageInfo: ChatOutput['usage'] | undefined = undefined;
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: input.message },
    ];

    console.log('[chat] calling LLM', { model });
    const completion = await openai.chat.completions.create({
      model,
      temperature: input.deep ? 0.35 : 0.5,
      messages,
    });
    reply = completion.choices[0]?.message?.content?.trim() || 'Sem resposta.';

    const promptTokens = completion.usage?.prompt_tokens ?? 0;
    const completionTokens = completion.usage?.completion_tokens ?? 0;
    const totalTokens = promptTokens + completionTokens;
    const cost = estimateCostUSD({ model, promptTokens, completionTokens });
    usageInfo = {
      promptTokens,
      completionTokens,
      totalTokens,
      usdEstimate: cost.usd,
    };
  } catch (err: any) {
    console.error('[chat] LLM error', err);
    throw new Error(`OpenAI chat failed: ${err?.message || err}`);
  }

  // Gerar sugestão de mudança de modo se apropriado
  const modeSuggestion = intentDetection.shouldPromptUser 
    ? formatSuggestion(intentDetection) 
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
