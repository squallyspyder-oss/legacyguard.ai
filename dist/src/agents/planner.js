"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPlanner = runPlanner;
exports.getExecutionOrder = getExecutionOrder;
/* eslint-disable @typescript-eslint/no-explicit-any */
const openai_1 = __importDefault(require("openai"));
const PLANNER_SYSTEM_PROMPT = `Você é o Planner Agent do LegacyGuard, especializado em quebrar tarefas complexas de manutenção de código legado em subtarefas executáveis.

Sua função é analisar o pedido do usuário e criar um plano de execução estruturado.

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
async function runPlanner(task) {
    var _a, _b, _c, _d;
    // Modo mock para testes/offline: evita dependência de API externa
    if (process.env.LEGACYGUARD_PLANNER_MODE === 'mock' || (!process.env.OPENAI_API_KEY && process.env.NODE_ENV === 'test')) {
        const hasIncidentContext = task.request.toLowerCase().includes('incident') ||
            task.request.toLowerCase().includes('error') ||
            task.request.toLowerCase().includes('bug') ||
            task.request.toLowerCase().includes('issue') ||
            ((_a = task.context) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes('stacktrace'));
        const subtasks = hasIncidentContext ? [
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
        const fakePlan = {
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
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
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
    const content = ((_c = (_b = response.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '{}';
    let parsed;
    try {
        parsed = JSON.parse(content);
    }
    catch {
        throw new Error('Planner retornou JSON inválido');
    }
    const plan = {
        id: `plan-${Date.now()}`,
        originalRequest: task.request,
        summary: parsed.summary || 'Plano gerado',
        subtasks: (parsed.subtasks || []).map((st, idx) => ({
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
        requiresApproval: (_d = parsed.requiresApproval) !== null && _d !== void 0 ? _d : false,
    };
    // Validação: se riskLevel é high/critical, forçar aprovação
    if (plan.riskLevel === 'critical' || plan.riskLevel === 'high') {
        plan.requiresApproval = true;
    }
    return plan;
}
function getExecutionOrder(plan) {
    // Retorna subtarefas agrupadas por "wave" (podem executar em paralelo)
    const completed = new Set();
    const waves = [];
    const remaining = [...plan.subtasks];
    while (remaining.length > 0) {
        const wave = [];
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
            wave.push(remaining.shift());
        }
        wave.forEach((t) => completed.add(t.id));
        waves.push(wave);
    }
    return waves;
}
