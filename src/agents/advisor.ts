import OpenAI from 'openai';
import { Octokit } from 'octokit';
import path from 'path';
import { buildGraphFromFiles, searchGraph, loadCodeFiles, CodeFile } from '../lib/indexer';
import { createPgVectorIndexer } from '../lib/indexer-pgvector';
import { TwinBuilderResult } from './twin-builder';
import { LegacyProfile } from '../analyzers/legacy-profiler';
import { BehaviorClassification } from '../analyzers/behavior-classifier';

// System prompt detalhado para o Advisor Agent
const ADVISOR_SYSTEM_PROMPT = `Você é o Advisor Agent do LegacyGuard, especializado em analisar código legado e fornecer recomendações acionáveis.

RESPONSABILIDADES:
1. Analisar código e identificar problemas de qualidade, segurança e performance
2. Sugerir melhorias específicas com justificativas técnicas
3. Identificar riscos e dependências críticas
4. Recomendar ordem de refatoração baseada em impacto
5. Integrar contexto de incidentes (Twin) quando disponível

QUANDO HOUVER CONTEXTO DE TWIN/INCIDENTE:
- Priorize análise dos arquivos relacionados ao incidente
- Considere o stack trace para identificar pontos de falha
- Sugira correções específicas para o problema reportado
- Avalie se há padrões similares em outras partes do código

FORMATO DE RESPOSTA (JSON):
{
  "summary": "Resumo da análise em 2-3 frases",
  "riskLevel": "low|medium|high|critical",
  "findings": [
    {
      "type": "security|quality|performance|maintainability",
      "severity": "info|warning|error|critical",
      "file": "caminho/arquivo.ts",
      "description": "Descrição do problema",
      "suggestion": "Como resolver",
      "effort": "low|medium|high"
    }
  ],
  "prioritizedActions": [
    "Ação 1 (mais urgente)",
    "Ação 2",
    "Ação 3"
  ],
  "incidentAnalysis": {
    "rootCause": "Causa raiz provável (se contexto de twin disponível)",
    "affectedAreas": ["lista de áreas afetadas"],
    "fixSuggestion": "Sugestão de fix específica"
  }
}`;

export type AdvisorInput = {
  repoPath?: string;
  files?: CodeFile[];
  diff?: string;
  summary?: string;
  query?: string;
  twinContext?: TwinBuilderResult;
  legacyProfile?: LegacyProfile;
  behaviorClassification?: BehaviorClassification;
  dependencyContext?: Record<string, unknown>;
};

export type AdvisorFinding = {
  type: 'security' | 'quality' | 'performance' | 'maintainability';
  severity: 'info' | 'warning' | 'error' | 'critical';
  file?: string;
  description: string;
  suggestion?: string;
  effort?: 'low' | 'medium' | 'high';
};

export type AdvisorOutput = {
  role: 'advisor';
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: AdvisorFinding[];
  prioritizedActions: string[];
  suggestions: string[];
  incidentAnalysis?: {
    rootCause?: string;
    affectedAreas?: string[];
    fixSuggestion?: string;
  };
  graph?: { nodes: number; edges: number };
  vectorHits?: number;
};

export async function runAdvisor(task: AdvisorInput): Promise<AdvisorOutput> {
  const suggestions: string[] = [];
  let files: CodeFile[] = task.files || [];
  let graphSummary: { nodes: number; edges: number } | undefined;
  const vectorEnabled = Boolean(process.env.PGVECTOR_URL && process.env.OPENAI_API_KEY);
  const llmEnabled = Boolean(process.env.OPENAI_API_KEY);

  // Carrega arquivos do repositório (limite para performance)
  if (!files.length && task.repoPath) {
    try {
      files = await loadCodeFiles(path.resolve(task.repoPath));
    } catch (err) {
      console.error('Falha ao carregar arquivos para o Advisor', err);
    }
  }

  // Indexa em grafo leve e faz busca de contexto
  let vectorHits: any[] = [];
  if (files.length) {
    try {
      const graph = buildGraphFromFiles(files);
      graphSummary = { nodes: graph.nodes.size, edges: graph.edges.length };
      const searchQuery = task.query || task.summary || task.twinContext?.message || 'refatoração';
      const hits = searchGraph(searchQuery, graph, 5);
      hits.forEach((hit) => {
        suggestions.push(`Revisar ${hit.path} (símbolos: ${hit.symbols.slice(0, 5).join(', ')})`);
      });

      if (vectorEnabled) {
        try {
          const indexer = createPgVectorIndexer();
          const slice = files.slice(0, 40);
          await Promise.allSettled(slice.map((f) => indexer.upsertFile(f)));
          vectorHits = await indexer.search(searchQuery, 5);
          vectorHits.forEach((hit) => {
            suggestions.push(`(vetor) Similar em ${hit.path} (símbolos: ${hit.symbols.slice(0, 5).join(', ')})`);
          });
        } catch (err) {
          console.error('pgvector search falhou', err);
        }
      }
    } catch (err) {
      console.error('Falha ao indexar/buscar grafo', err);
    }
  }

  // Se LLM disponível, usar para análise profunda
  if (llmEnabled) {
    try {
      const llmResult = await runAdvisorLLM(task, files, suggestions);
      return {
        ...llmResult,
        graph: graphSummary,
        vectorHits: vectorHits.length,
      };
    } catch (err) {
      console.error('Advisor LLM falhou, usando fallback', err);
    }
  }

  // Fallback: sugestões baseadas em heurísticas
  return buildFallbackResponse(task, suggestions, graphSummary, vectorHits.length);
}

async function runAdvisorLLM(
  task: AdvisorInput,
  files: CodeFile[],
  graphSuggestions: string[]
): Promise<AdvisorOutput> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Construir contexto para o LLM
  let userPrompt = '';

  // Query/objetivo
  userPrompt += `## OBJETIVO DA ANÁLISE\n${task.query || task.summary || 'Análise geral do código'}\n\n`;

  // Contexto de Twin/Incidente (PRIORIDADE)
  if (task.twinContext) {
    userPrompt += `## CONTEXTO DE INCIDENTE (TWIN)\n`;
    userPrompt += `- Twin ID: ${task.twinContext.twinId}\n`;
    userPrompt += `- Status: ${task.twinContext.status}\n`;
    userPrompt += `- Mensagem: ${task.twinContext.message}\n`;
    
    if (task.twinContext.syntheticTests?.length) {
      userPrompt += `- Testes sintéticos: ${task.twinContext.syntheticTests.map(t => t.name).join(', ')}\n`;
    }
    
    if (task.twinContext.impactGuardrails?.warnings?.length) {
      userPrompt += `- Alertas de impacto: ${task.twinContext.impactGuardrails.warnings.join('; ')}\n`;
    }
    
    if (task.twinContext.harness?.commands?.length) {
      userPrompt += `- Comandos sugeridos: ${task.twinContext.harness.commands.map(c => c.name).join(', ')}\n`;
    }
    userPrompt += '\n';
  }

  // Legacy Profile (análise estática)
  if (task.legacyProfile) {
    userPrompt += `## PERFIL DO CÓDIGO LEGADO\n`;
    userPrompt += `- Arquivos escaneados: ${task.legacyProfile.filesScanned}\n`;
    userPrompt += `- Signals detectados: ${Object.entries(task.legacyProfile.signals).filter(([,v]) => v).map(([k]) => k).join(', ') || 'nenhum'}\n`;
    if (task.legacyProfile.suspiciousStrings.length) {
      userPrompt += `- Strings suspeitas: ${task.legacyProfile.suspiciousStrings.slice(0, 5).join('; ')}\n`;
    }
    if (task.legacyProfile.findings.length) {
      userPrompt += `- Findings: ${task.legacyProfile.findings.slice(0, 10).join('; ')}\n`;
    }
    userPrompt += '\n';
  }

  // Classificação de comportamento
  if (task.behaviorClassification) {
    userPrompt += `## CLASSIFICAÇÃO DE COMPORTAMENTO\n`;
    userPrompt += `- Risco: ${task.behaviorClassification.risk}\n`;
    userPrompt += `- Comportamentos: ${task.behaviorClassification.behaviors.join(', ')}\n`;
    userPrompt += `- Razões: ${task.behaviorClassification.reasons.join('; ')}\n\n`;
  }

  // Diff se disponível
  if (task.diff) {
    userPrompt += `## DIFF/PATCH\n\`\`\`\n${task.diff.slice(0, 5000)}\n\`\`\`\n\n`;
  }

  // Sugestões do grafo
  if (graphSuggestions.length) {
    userPrompt += `## ARQUIVOS RELEVANTES (via busca semântica)\n${graphSuggestions.join('\n')}\n\n`;
  }

  // Amostra de código
  if (files.length) {
    const sample = files.slice(0, 3).map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 2000)}\n\`\`\``).join('\n\n');
    userPrompt += `## AMOSTRA DE CÓDIGO\n${sample}\n\n`;
  }

  userPrompt += 'Analise o contexto acima e forneça recomendações detalhadas no formato JSON especificado.';

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_DEEP_MODEL || 'gpt-4o',
    messages: [
      { role: 'system', content: ADVISOR_SYSTEM_PROMPT },
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
    throw new Error('Advisor LLM retornou JSON inválido');
  }

  return {
    role: 'advisor',
    summary: parsed.summary || 'Análise concluída',
    riskLevel: parsed.riskLevel || 'medium',
    findings: (parsed.findings || []).map((f: any) => ({
      type: f.type || 'quality',
      severity: f.severity || 'info',
      file: f.file,
      description: f.description || '',
      suggestion: f.suggestion,
      effort: f.effort,
    })),
    prioritizedActions: parsed.prioritizedActions || [],
    suggestions: parsed.prioritizedActions || [],
    incidentAnalysis: parsed.incidentAnalysis,
  };
}

function buildFallbackResponse(
  task: AdvisorInput,
  suggestions: string[],
  graphSummary?: { nodes: number; edges: number },
  vectorHitCount?: number
): AdvisorOutput {
  const findings: AdvisorFinding[] = [];
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  // Analisar contexto de twin se disponível
  if (task.twinContext) {
    if (task.twinContext.status === 'failed') {
      findings.push({
        type: 'quality',
        severity: 'error',
        description: `Twin builder falhou: ${task.twinContext.message}`,
        suggestion: 'Verificar configuração do sandbox e dependências',
      });
      riskLevel = 'high';
    }

    if (task.twinContext.impactGuardrails?.warnings?.length) {
      task.twinContext.impactGuardrails.warnings.forEach(w => {
        findings.push({
          type: 'security',
          severity: 'warning',
          description: w,
          suggestion: 'Revisar impacto antes de prosseguir',
        });
      });
      riskLevel = riskLevel === 'low' ? 'medium' : riskLevel;
    }
  }

  // Analisar behavior classification
  if (task.behaviorClassification) {
    if (task.behaviorClassification.risk === 'high') {
      riskLevel = 'high';
      task.behaviorClassification.reasons.forEach(r => {
        findings.push({
          type: 'security',
          severity: 'warning',
          description: r,
        });
      });
    }
  }

  // Sugestões padrão se nada encontrado
  if (!suggestions.length && !findings.length) {
    suggestions.push('Adicionar testes unitários para módulos críticos');
    suggestions.push('Refatorar funções extensas em helpers menores');
  }

  return {
    role: 'advisor',
    summary: task.twinContext 
      ? `Análise baseada em incidente: ${task.twinContext.message?.slice(0, 100) || 'sem detalhes'}`
      : 'Análise de código concluída via heurísticas',
    riskLevel,
    findings,
    prioritizedActions: suggestions.slice(0, 5),
    suggestions,
    incidentAnalysis: task.twinContext ? {
      rootCause: 'Requer análise LLM para identificação precisa',
      affectedAreas: task.twinContext.harness?.commands?.map(c => c.name) || [],
      fixSuggestion: 'Configure OPENAI_API_KEY para análise detalhada',
    } : undefined,
    graph: graphSummary,
    vectorHits: vectorHitCount,
  };
}
