/* eslint-disable @typescript-eslint/no-explicit-any */
import OpenAI from 'openai';
import type { TwinBuilderResult } from './twin-builder';
import { LEGACYGUARD_COMPACT_CONTEXT } from '../lib/system-context';

export type SubTask = {
  id: string;
  type: 'analyze' | 'refactor' | 'test' | 'security' | 'review' | 'deploy' | 'reproduce';
  description: string;
  agent: 'advisor' | 'operator' | 'executor' | 'reviewer' | 'advisor-impact' | 'twin-builder';
  dependencies: string[]; // IDs das subtarefas que precisam completar antes
  priority: 'high' | 'medium' | 'low';
  estimatedComplexity: number; // 1-10
  incidentContext?: {
    errorType?: string;
    stackTrace?: string;
    affectedFiles?: string[];
  };
  sandboxPhase?: 'pre' | 'post';
};

export type Plan = {
  id: string;
  originalRequest: string;
  summary: string;
  subtasks: SubTask[];
  estimatedTime: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
};

const PLANNER_SYSTEM_PROMPT = `Você é o **Planner Agent** do LegacyGuard, especializado em quebrar tarefas complexas de manutenção de código legado em subtarefas executáveis.

## Contexto do Sistema
${LEGACYGUARD_COMPACT_CONTEXT}

## Seu Papel
Você cria planos de execução que o Orchestrator seguirá. Cada subtarefa será executada por um agente especializado.

REGRAS:
1. Para incidentes/erros, SEMPRE comece com twin-builder para reproduzir o problema
2. Sempre inclua análise (advisor) antes de modificações
3. Segurança é prioridade - inclua scan de vulnerabilidades quando aplicável
4. Testes devem ser gerados ANTES de refatorações arriscadas
5. Review é obrigatório para mudanças de alto risco
6. Deploy/merge só após aprovação humana para operações críticas

AGENTES DISPONÍVEIS:
- twin-builder: Cria "digital twin" do incidente - reproduz cenário controlado para entender o problema (USE PRIMEIRO para incidentes)
- advisor: Analisa código, sugere melhorias, identifica problemas
- advisor-impact: Analisa impacto/refatores em graph/index
- operator: Cria branches, aplica patches, gera PRs
- reviewer: Revisa código, valida qualidade, checa compliance
- executor: Merge PRs, deploy (requer aprovação)

TIPOS DE SUBTAREFA:
- reproduce: Reprodução controlada de incidente/bug (twin-builder)
- analyze: Análise de código/contexto
- refactor: Refatoração/correção
- test: Geração/execução de testes
- security: Scan de vulnerabilidades
- review: Revisão de código
- deploy: Merge/deploy

FLUXO RECOMENDADO PARA INCIDENTES:
1. reproduce (twin-builder) - entender e reproduzir o problema
2. analyze (advisor) - analisar causa raiz com contexto do twin
 3. sandbox-pre (advisor/operator) - rodar harness Twin em sandbox para reproduzir/validar falha
 4. refactor (operator) - aplicar correção
 5. test (operator) - validar fix em sandbox
 6. sandbox-post (operator) - rodar harness Twin novamente; se passar, incidente mitigado
 7. review (reviewer) - revisar qualidade
 8. deploy (executor) - merge após aprovação

Responda APENAS com JSON válido no formato:
{
  "summary": "Resumo do plano",
  "subtasks": [
    {
      "id": "1",
      "type": "reproduce",
      "description": "Criar digital twin do incidente para reproduzir em ambiente controlado",
      "agent": "twin-builder",
      "dependencies": [],
      "priority": "high",
      "estimatedComplexity": 4,
      "incidentContext": {
        "errorType": "Tipo do erro se aplicável",
        "affectedFiles": ["arquivos relacionados"]
      }
    },
    {
      "id": "2",
      "type": "test",
      "description": "Rodar harness Twin em sandbox (fase pré-patch) para reproduzir falha",
      "agent": "advisor",
      "dependencies": ["1"],
      "priority": "high",
      "estimatedComplexity": 3,
      "sandboxPhase": "pre"
    },
    {
      "id": "3",
      "type": "analyze",
      "description": "Analisar causa raiz com contexto do twin",
      "agent": "advisor",
      "dependencies": ["2"],
      "priority": "high",
      "estimatedComplexity": 3
    }
    {
      "id": "4",
      "type": "test",
      "description": "Rodar harness Twin em sandbox (fase pós-patch) para confirmar que passou",
      "agent": "operator",
      "dependencies": ["3"],
      "priority": "high",
      "estimatedComplexity": 3,
      "sandboxPhase": "post"
    }
  ],
  "estimatedTime": "30 minutos",
  "riskLevel": "medium",
  "requiresApproval": false
}`;

export async function runPlanner(task: {
  request: string;
  context?: string;
  repoInfo?: { files: number; languages: string[] };
  twinContext?: TwinBuilderResult | undefined;
}): Promise<Plan> {
  // Modo mock para testes/offline: evita dependência de API externa
  if (process.env.LEGACYGUARD_PLANNER_MODE === 'mock' || (!process.env.OPENAI_API_KEY && process.env.NODE_ENV === 'test')) {
    const hasIncidentContext = task.request.toLowerCase().includes('incident') || 
                                task.request.toLowerCase().includes('error') ||
                                task.request.toLowerCase().includes('bug') ||
                                task.request.toLowerCase().includes('issue') ||
                                task.context?.toLowerCase().includes('stacktrace');
    
    const subtasks: SubTask[] = hasIncidentContext ? [
      {
        id: '1',
        type: 'reproduce',
        description: 'Criar digital twin do incidente para reproduzir em ambiente controlado',
        agent: 'twin-builder',
        dependencies: [],
        priority: 'high',
        estimatedComplexity: 4,
        incidentContext: {
          errorType: 'unknown',
          affectedFiles: [],
        },
      },
      {
        id: '2',
        type: 'analyze',
        description: 'Analisar causa raiz com contexto do twin',
        agent: 'advisor',
        dependencies: ['1'],
        priority: 'high',
        estimatedComplexity: 3,
      },
      {
        id: '3',
        type: 'review',
        description: 'Revisar alterações antes de executar',
        agent: 'reviewer',
        dependencies: ['2'],
        priority: 'medium',
        estimatedComplexity: 3,
      },
    ] : [
      {
        id: '1',
        type: 'analyze',
        description: 'Analisar contexto e riscos',
        agent: 'advisor',
        dependencies: [],
        priority: 'high',
        estimatedComplexity: 3,
      },
      {
        id: '2',
        type: 'review',
        description: 'Revisar alterações antes de executar',
        agent: 'reviewer',
        dependencies: ['1'],
        priority: 'medium',
        estimatedComplexity: 3,
      },
    ];

    const fakePlan: Plan = {
      id: `plan-${Date.now()}`,
      originalRequest: task.request,
      summary: hasIncidentContext ? 'Plano com reprodução de incidente via twin-builder' : 'Plano mock para testes',
      subtasks,
      estimatedTime: hasIncidentContext ? '25 minutos' : '15 minutos',
      riskLevel: 'medium',
      requiresApproval: false,
    };
    return fakePlan;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const userPrompt = `
PEDIDO DO USUÁRIO:
${task.request}

${task.context ? `CONTEXTO ADICIONAL:\n${task.context}` : ''}

${task.repoInfo ? `INFO DO REPOSITÓRIO:\n- Arquivos: ${task.repoInfo.files}\n- Linguagens: ${task.repoInfo.languages.join(', ')}` : ''}

Crie um plano de execução detalhado para esta tarefa.
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: PLANNER_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';
  let parsed: any;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Planner retornou JSON inválido');
  }

  const plan: Plan = {
    id: `plan-${Date.now()}`,
    originalRequest: task.request,
    summary: parsed.summary || 'Plano gerado',
    subtasks: (parsed.subtasks || []).map((st: any, idx: number) => ({
      id: st.id || String(idx + 1),
      type: st.type || 'analyze',
      description: st.description || '',
      agent: st.agent || 'advisor',
      dependencies: st.dependencies || [],
      priority: st.priority || 'medium',
      estimatedComplexity: st.estimatedComplexity || 5,
      sandboxPhase: st.sandboxPhase,
    })),
    estimatedTime: parsed.estimatedTime || 'desconhecido',
    riskLevel: parsed.riskLevel || 'medium',
    requiresApproval: parsed.requiresApproval ?? false,
  };

  // Validação: se riskLevel é high/critical, forçar aprovação
  if (plan.riskLevel === 'critical' || plan.riskLevel === 'high') {
    plan.requiresApproval = true;
  }

  return plan;
}

export function getExecutionOrder(plan: Plan): SubTask[][] {
  // Retorna subtarefas agrupadas por "wave" (podem executar em paralelo)
  const completed = new Set<string>();
  const waves: SubTask[][] = [];
  const remaining = [...plan.subtasks];

  while (remaining.length > 0) {
    const wave: SubTask[] = [];

    for (let i = remaining.length - 1; i >= 0; i--) {
      const task = remaining[i];
      const depsOk = task.dependencies.every((d) => completed.has(d));

      if (depsOk) {
        wave.push(task);
        remaining.splice(i, 1);
      }
    }

    if (wave.length === 0 && remaining.length > 0) {
      // Ciclo de dependências - forçar execução
      console.warn('Ciclo de dependências detectado, forçando execução');
      wave.push(remaining.shift()!);
    }

    wave.forEach((t) => completed.add(t.id));
    waves.push(wave);
  }

  return waves;
}
