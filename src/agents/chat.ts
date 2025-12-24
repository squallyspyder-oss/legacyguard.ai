import OpenAI from 'openai';
import { estimateCostUSD } from '../lib/pricing';

// Sinais fortes de necessidade de agentes (ação/execução)
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
};

export async function runChat(input: {
  message: string;
  deep?: boolean;
  repoPath?: string;
  context?: string;
}): Promise<ChatOutput> {
  const cheapModel = process.env.OPENAI_CHEAP_MODEL || 'gpt-4o-mini';
  const deepModel = process.env.OPENAI_DEEP_MODEL || 'gpt-4o';
  const model = input.deep ? deepModel : cheapModel;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const system = input.deep
    ? `Você é o modo Chat Livre (profundo) do LegacyGuard. Responda de forma objetiva, traga riscos, opções e próximos passos. Quando perceber intenção de execução (patch, PR, merge, testes, deploy), recomende orquestrar agentes.`
    : `Você é o modo econômico de Chat Livre do LegacyGuard. Seja conciso e barato. Somente orientação; sem passos executáveis. Se detectar necessidade de agentes para patch/PR/merge/testes/refatoração, recomende orquestrar.`;

  const needsAction = ACTION_REGEX.test(input.message || '');

  let reply = '';
  let usageInfo: ChatOutput['usage'] | undefined = undefined;
  try {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: input.message },
    ];

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
  } catch {
    reply = 'Modo chat indisponível no momento. Verifique a chave OPENAI_API_KEY.';
  }

  return {
    reply,
    suggestOrchestrate: needsAction,
    costTier: input.deep ? 'deep' : 'cheap',
    modelUsed: model,
    usage: usageInfo,
  };
}
