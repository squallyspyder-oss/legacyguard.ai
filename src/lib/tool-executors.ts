/**
 * Tool Executors - Implementação Real das Ferramentas do Agente
 * 
 * Conecta as definições de ferramentas às APIs reais do LegacyGuard.
 * Inclui integração com Guardian Flow para segurança.
 */

import type { ToolExecutor } from './agent-runtime';
import { getRAGIndexer } from './rag-indexer';
import { runSandbox } from './sandbox';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec as cpExec } from 'child_process';
import crypto from 'crypto';
import {
  buildExecutionPlan,
  indexConversation,
  type ConversationTurn,
  type ExecutionStep,
} from './execution-journal';
import {
  createApproval,
  validateApproval,
  initApprovalStore,
} from './approval-store';

// Guardian Flow imports (apenas os que usam tipos simples)
import {
  classifyIntent,
  LOA_CONFIGS,
  type LOALevel,
} from '../guardian-flow';

export interface ExecutorConfig {
  repoPath?: string;
  sandboxEnabled: boolean;
  sandboxMode: 'fail' | 'permissive';
  workerEnabled: boolean;
  // Guardian Flow config
  guardianFlowEnabled?: boolean;
  userId?: string;
}

// Type for RAG search result
interface RAGResult {
  path?: string;
  content?: string;
  snippet?: string;
  score?: number;
  language?: string;
}

/**
 * Cria um executor de ferramentas configurado para o contexto atual
 */
export function createToolExecutor(config: ExecutorConfig): ToolExecutor {
  const baseDir = config.repoPath || process.cwd();
  const execAsync = promisify(cpExec);

  /**
   * Calcula blast radius real baseado em análise de dependências
   * Considera: número de arquivos afetados, dependentes reversos, arquivos críticos
   */
  async function calculateRealBlastRadius(affectedFiles: string[]): Promise<{
    score: number;
    details: {
      directFiles: number;
      dependentFiles: number;
      criticalFiles: string[];
      riskFactors: { factor: string; weight: number }[];
    };
  }> {
    if (affectedFiles.length === 0) {
      return {
        score: 0,
        details: { directFiles: 0, dependentFiles: 0, criticalFiles: [], riskFactors: [] },
      };
    }

    const riskFactors: { factor: string; weight: number }[] = [];
    let baseScore = 0;

    // Fator 1: Número de arquivos diretamente afetados
    const directFiles = affectedFiles.length;
    baseScore += Math.min(directFiles * 5, 30); // max 30 pontos
    if (directFiles > 5) {
      riskFactors.push({ factor: `${directFiles} arquivos diretamente afetados`, weight: 10 });
    }

    // Fator 2: Arquivos críticos (auth, db, config, security)
    const criticalPatterns = [/auth/i, /security/i, /password/i, /secret/i, /config/i, /database/i, /migration/i];
    const criticalFiles = affectedFiles.filter(f => criticalPatterns.some(p => p.test(f)));
    if (criticalFiles.length > 0) {
      baseScore += criticalFiles.length * 15; // 15 pontos por arquivo crítico
      riskFactors.push({ factor: `${criticalFiles.length} arquivos críticos`, weight: criticalFiles.length * 15 });
    }

    // Fator 3: Analisar dependências reversas (quem importa esses arquivos?)
    let dependentFiles = 0;
    try {
      for (const file of affectedFiles.slice(0, 5)) { // limitar para performance
        const fileName = path.basename(file).replace(/\.(ts|js|tsx|jsx)$/, '');
        // Buscar arquivos que importam este
        const srcDir = path.join(baseDir, 'src');
        const files = await findFilesRecursive(srcDir, /\.(ts|tsx|js|jsx)$/);
        for (const srcFile of files) {
          try {
            const content = await fs.readFile(srcFile, 'utf-8');
            if (content.includes(fileName) && srcFile !== path.join(baseDir, file)) {
              dependentFiles++;
            }
          } catch { /* ignore */ }
        }
      }
      if (dependentFiles > 0) {
        baseScore += Math.min(dependentFiles * 3, 30); // max 30 pontos
        riskFactors.push({ factor: `${dependentFiles} arquivos dependentes`, weight: Math.min(dependentFiles * 3, 30) });
      }
    } catch { /* ignore errors in dependency analysis */ }

    // Normalizar para 0-100
    const finalScore = Math.min(baseScore, 100);

    return {
      score: finalScore,
      details: {
        directFiles,
        dependentFiles,
        criticalFiles,
        riskFactors,
      },
    };
  }

  /**
   * Busca arquivos recursivamente em um diretório
   */
  async function findFilesRecursive(dir: string, pattern: RegExp): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          results.push(...await findFilesRecursive(fullPath, pattern));
        } else if (entry.isFile() && pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
    } catch { /* directory doesn't exist or not readable */ }
    return results;
  }

  // Inicializar approval store
  let approvalStoreInitialized = false;
  async function ensureApprovalStore() {
    if (!approvalStoreInitialized) {
      await initApprovalStore(baseDir);
      approvalStoreInitialized = true;
    }
  }

  type SemgrepFinding = {
    severity: string;
    type: string;
    message: string;
    path: string;
    start?: number;
  };

  async function runSemgrepScan(repoPath: string): Promise<{ success: boolean; findings: SemgrepFinding[]; stderr?: string }> {
    if (process.env.LEGACYGUARD_FORCE_DOCKER !== 'true') {
      // rely on docker availability; if absent, return error
      try {
        await execAsync('docker version --format "{{.Server.Version}}"', { timeout: 2000 });
      } catch {
        return {
          success: false,
          findings: [],
          stderr: 'Docker not available for semgrep scan',
        };
      }
    }

    const cmd = [
      'docker run --rm',
      '--network=none',
      '-v', `${repoPath}:/src:ro`,
      'returntocorp/semgrep:latest',
      'semgrep --config auto --json --timeout 45 --exclude node_modules --exclude .git /src',
    ].join(' ');

    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
      const parsed = JSON.parse(stdout || '{}') as { results?: Array<{ extra?: { severity?: string; message?: string }; check_id?: string; path: string; start?: { line?: number } }> };
      const findings: SemgrepFinding[] = Array.isArray(parsed.results)
        ? parsed.results.map((r) => ({
            severity: r.extra?.severity || 'unknown',
            type: r.check_id || 'unknown',
            message: r.extra?.message || 'No message',
            path: r.path,
            start: r.start?.line,
          }))
        : [];
      return { success: true, findings, stderr };
    } catch (err: unknown) {
      return {
        success: false,
        findings: [],
        stderr: (err as { stderr?: string; message?: string })?.stderr || (err as Error)?.message || 'semgrep failed',
      };
    }
  }

  function stableStringify(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);

    if (Array.isArray(value)) {
      return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    const mapped = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${mapped.join(',')}}`;
  }

  function pickFieldsFromJSON(jsonText: string, fields: string[]): {
    data?: Record<string, unknown>;
    error?: string;
  } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText || '{}');
    } catch (err) {
      return { error: `Structured comparison solicitado, mas stdout não é JSON: ${(err as Error)?.message || err}` };
    }

    if (parsed === null || typeof parsed !== 'object') {
      return { error: 'Structured comparison solicitado, mas stdout não é JSON estruturado' };
    }

    const output: Record<string, unknown> = {};
    for (const field of fields) {
      const parts = field.split('.').filter(Boolean);
      let cursor: unknown = parsed;
      for (const part of parts) {
        if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, part)) {
          cursor = (cursor as Record<string, unknown>)[part];
        } else {
          cursor = undefined;
          break;
        }
      }
      output[field] = cursor;
    }
    return { data: output };
  }

  // Deterministic runner: execute the same command N times inside sandbox and compare hashes
  async function runDeterministicRuns(params: {
    command: string;
    runs?: number;
    timeoutSec?: number;
    structuredFields?: string[];
    structuredSource?: 'stdout' | 'stderr';
  }) {
    const runs = params.runs && params.runs > 0 ? params.runs : 5;
    const timeoutMs = (params.timeoutSec && params.timeoutSec > 0 ? params.timeoutSec : 30) * 1000;
    const executions: Array<{
      stdout: string;
      stderr: string;
      exitCode: number;
      hash: string;
      durationMs: number;
      structured?: Record<string, unknown>;
      hashSource: 'structured' | 'raw';
    }> = [];

    for (let i = 0; i < runs; i++) {
      const result = await runSandbox({
        enabled: true,
        repoPath: baseDir,
        command: params.command,
        timeoutMs,
        failMode: 'fail',
        isolationProfile: 'strict',
        networkPolicy: 'none',
        fsPolicy: 'readonly',
        useDocker: true,
      });

      let hashInput = '';
      let structured: Record<string, unknown> | undefined;
      let hashSource: 'structured' | 'raw' = 'raw';

      if (params.structuredFields && params.structuredFields.length > 0) {
        const source = params.structuredSource === 'stderr' ? result.stderr : result.stdout;
        const picked = pickFieldsFromJSON(source, params.structuredFields);
        if (picked.error) {
          return {
            success: false,
            consistent: false,
            reason: picked.error,
            executions,
          };
        }
        structured = picked.data;
        hashInput = stableStringify(structured);
        hashSource = 'structured';
      } else {
        hashInput = `${result.stdout || ''}${result.stderr || ''}`;
      }

      const hash = crypto
        .createHash('sha256')
        .update(hashInput)
        .update(String(result.exitCode ?? 0))
        .digest('hex');

      executions.push({
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        hash,
        structured,
        hashSource,
      });

      if (!result.success) {
        return {
          success: false,
          consistent: false,
          reason: `Run ${i + 1}/${runs} failed with exitCode ${result.exitCode}`,
          executions,
        };
      }
    }

    const firstHash = executions[0]?.hash;
    const consistent = executions.every((e) => e.hash === firstHash);
    const hashSource = params.structuredFields && params.structuredFields.length > 0 ? 'structured' : 'raw';

    return {
      success: consistent,
      consistent,
      reason: consistent ? 'All runs consistent' : 'Output mismatch between runs',
      executions,
      hashSource,
      structuredFields: params.structuredFields,
    };
  }

  return {
    // ========================================================================
    // searchRAG - Busca no índice vetorial
    // ========================================================================
    async searchRAG({ query, limit = 5, fileFilter }) {
      try {
        const indexer = getRAGIndexer();
        const results = await indexer.search(query, { limit });
        
        if (!results || results.length === 0) {
          return JSON.stringify({
            success: true,
            count: 0,
            message: 'Nenhum resultado encontrado no RAG. Tente termos diferentes ou verifique se o repositório foi indexado.',
            results: [],
          });
        }

        // Filtrar por extensão se especificado
        let filtered: RAGResult[] = results;
        if (fileFilter) {
          filtered = results.filter((r: RAGResult) => r.path?.endsWith(fileFilter));
        }

        return JSON.stringify({
          success: true,
          count: filtered.length,
          results: filtered.map((r: RAGResult) => ({
            path: r.path,
            snippet: r.content?.substring(0, 500) || r.snippet,
            score: r.score,
            language: r.language,
          })),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao buscar no RAG: ${message}`,
          hint: 'Verifique se o RAG está configurado e o repositório foi indexado.',
        });
      }
    },

    // ========================================================================
    // runSandbox - Execução isolada
    // ========================================================================
    async runSandbox({ command, workdir, timeout = 30 }) {
      if (!config.sandboxEnabled) {
        return JSON.stringify({
          success: false,
          error: 'Sandbox desabilitado nas configurações',
          hint: 'Ative o Sandbox nas configurações para executar comandos.',
        });
      }

      try {
        const result = await runSandbox({
          command,
          repoPath: workdir || baseDir,
          timeoutMs: timeout * 1000,
          failMode: config.sandboxMode === 'fail' ? 'fail' : 'warn',
          isolationProfile: config.sandboxMode === 'fail' ? 'strict' : 'permissive',
        });

        return JSON.stringify({
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout?.substring(0, 2000) || '',
          stderr: result.stderr?.substring(0, 500) || '',
          durationMs: result.durationMs,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro no sandbox: ${message}`,
        });
      }
    },

    // ========================================================================
    // getGraph - Grafo de dependências (simplificado)
    // ========================================================================
    async getGraph({ entryPoint, depth = 3 }) {
      try {
        // Análise simplificada de imports
        const entry = entryPoint || 'src/index.ts';
        
        const nodes: string[] = [entry];
        const edges: { from: string; to: string }[] = [];
        const visited = new Set<string>();
        
        async function analyzeFile(filePath: string, currentDepth: number) {
          if (currentDepth > depth || visited.has(filePath)) return;
          visited.add(filePath);
          
          try {
            const content = await fs.readFile(path.join(baseDir, filePath), 'utf-8');
            
            // Extrair imports
            const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
            let match;
            
            while ((match = importRegex.exec(content)) !== null) {
              const importPath = match[1];
              if (importPath.startsWith('.')) {
                const resolved = path.normalize(path.join(path.dirname(filePath), importPath));
                const resolvedWithExt = resolved.endsWith('.ts') || resolved.endsWith('.js') 
                  ? resolved 
                  : `${resolved}.ts`;
                
                if (!nodes.includes(resolvedWithExt)) {
                  nodes.push(resolvedWithExt);
                }
                edges.push({ from: filePath, to: resolvedWithExt });
                
                await analyzeFile(resolvedWithExt, currentDepth + 1);
              }
            }
          } catch { /* arquivo não existe ou erro de leitura */ }
        }
        
        await analyzeFile(entry, 0);
        
        return JSON.stringify({
          success: true,
          entryPoint: entry,
          depth,
          nodes: nodes.length,
          edges: edges.length,
          graph: { nodes, edges },
          summary: `Grafo com ${nodes.length} arquivos e ${edges.length} dependências analisadas até profundidade ${depth}`,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao gerar grafo: ${message}`,
        });
      }
    },

    // ========================================================================
    // analyzeCode - Análise estática
    // ========================================================================
    async analyzeCode({ filePath, checks = ['complexity', 'bugs'] }) {
      try {
        const fullPath = path.join(baseDir, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        const findings: { type: string; message: string; line?: number; severity: string }[] = [];
        
        // Análise de complexidade
        if (checks.includes('complexity')) {
          // Contar profundidade de nesting
          let maxNesting = 0;
          let currentNesting = 0;
          lines.forEach((line, i) => {
            const opens = (line.match(/{/g) || []).length;
            const closes = (line.match(/}/g) || []).length;
            currentNesting += opens - closes;
            if (currentNesting > maxNesting) maxNesting = currentNesting;
            
            if (currentNesting > 4) {
              findings.push({
                type: 'complexity',
                message: `Nesting profundo (nível ${currentNesting}) - considere extrair funções`,
                line: i + 1,
                severity: 'warning',
              });
            }
          });
          
          // Funções muito longas
          let functionStart = -1;
          lines.forEach((line, i) => {
            if (/function\s+\w+|=>\s*{|async\s+\w+\s*\(/.test(line)) {
              functionStart = i;
            }
            if (functionStart >= 0 && line.includes('}') && i - functionStart > 50) {
              findings.push({
                type: 'complexity',
                message: `Função muito longa (${i - functionStart} linhas) - considere dividir`,
                line: functionStart + 1,
                severity: 'warning',
              });
              functionStart = -1;
            }
          });
        }
        
        // Análise de bugs potenciais
        if (checks.includes('bugs')) {
          lines.forEach((line, i) => {
            // == ao invés de ===
            if (/[^=!]==[^=]/.test(line) && !/===/.test(line)) {
              findings.push({
                type: 'bug',
                message: 'Uso de == ao invés de === pode causar coerção inesperada',
                line: i + 1,
                severity: 'warning',
              });
            }
            
            // Console.log em produção
            if (/console\.(log|debug|info)/.test(line)) {
              findings.push({
                type: 'bug',
                message: 'console.log/debug/info deve ser removido em produção',
                line: i + 1,
                severity: 'info',
              });
            }
            
            // TODO/FIXME
            if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line)) {
              const match = line.match(/\/\/\s*(TODO|FIXME|HACK|XXX)[:\s]*(.*)/i);
              findings.push({
                type: 'todo',
                message: match ? match[0] : 'Marcador de tarefa pendente',
                line: i + 1,
                severity: 'info',
              });
            }
          });
        }
        
        // Análise de segurança
        if (checks.includes('security')) {
          lines.forEach((line, i) => {
            // Eval
            if (/\beval\s*\(/.test(line)) {
              findings.push({
                type: 'security',
                message: 'Uso de eval() é um risco de segurança',
                line: i + 1,
                severity: 'critical',
              });
            }
            
            // innerHTML
            if (/\.innerHTML\s*=/.test(line)) {
              findings.push({
                type: 'security',
                message: 'innerHTML pode permitir XSS - use textContent ou sanitização',
                line: i + 1,
                severity: 'warning',
              });
            }
            
            // Hardcoded secrets
            if (/(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"][^'"]+['"]/i.test(line)) {
              findings.push({
                type: 'security',
                message: 'Possível secret hardcoded - use variáveis de ambiente',
                line: i + 1,
                severity: 'critical',
              });
            }
          });
        }
        
        return JSON.stringify({
          success: true,
          file: filePath,
          lines: lines.length,
          checks,
          findings,
          summary: {
            total: findings.length,
            critical: findings.filter(f => f.severity === 'critical').length,
            warnings: findings.filter(f => f.severity === 'warning').length,
            info: findings.filter(f => f.severity === 'info').length,
          },
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao analisar: ${message}`,
        });
      }
    },

    // ========================================================================
    // orchestrate - Iniciar orquestração
    // ========================================================================
    async orchestrate({ task, agents = ['advisor', 'reviewer'], requiresApproval = true }) {
      if (!config.workerEnabled) {
        return JSON.stringify({
          success: false,
          error: 'Worker desabilitado',
          hint: 'Ative o Worker nas configurações para usar orquestração.',
        });
      }

      // Aqui apenas retornamos a intenção - a execução real será feita pelo frontend
      return JSON.stringify({
        success: true,
        action: 'orchestrate',
        task,
        agents,
        requiresApproval,
        message: `Orquestração preparada com agentes: ${agents.join(', ')}. ${requiresApproval ? 'Requer aprovação humana.' : 'Execução automática.'}`,
        nextStep: 'O sistema irá iniciar a orquestração automaticamente.',
      });
    },

    // ========================================================================
    // twinBuilder - Reprodução de incidentes
    // ========================================================================
    async twinBuilder({ scenario, fixtures = [], targetBehavior }) {
      if (!config.workerEnabled) {
        return JSON.stringify({
          success: false,
          error: 'Worker desabilitado',
          hint: 'Ative o Worker nas configurações para usar o Twin Builder.',
        });
      }

      return JSON.stringify({
        success: true,
        action: 'twin-builder',
        scenario,
        fixtures,
        targetBehavior,
        message: `Twin Builder preparado para cenário: "${scenario}". Fixtures: ${fixtures.length > 0 ? fixtures.join(', ') : 'serão geradas automaticamente'}`,
        nextStep: 'O sistema irá criar o ambiente de reprodução.',
      });
    },

    // ========================================================================
    // readFile - Leitura de arquivos
    // ========================================================================
    async readFile({ path: filePath, startLine, endLine }) {
      try {
        const fullPath = path.join(baseDir, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        const start = startLine ? Math.max(0, startLine - 1) : 0;
        const end = endLine ? Math.min(lines.length, endLine) : lines.length;
        const selectedLines = lines.slice(start, end);
        
        return JSON.stringify({
          success: true,
          path: filePath,
          totalLines: lines.length,
          selectedRange: { start: start + 1, end },
          content: selectedLines.join('\n'),
          language: filePath.split('.').pop() || 'text',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao ler arquivo: ${message}`,
          path: filePath,
        });
      }
    },

    // ========================================================================
    // listFiles - Listagem de diretórios
    // ========================================================================
    async listFiles({ path: dirPath, pattern, recursive = false }) {
      try {
        const fullPath = path.join(baseDir, dirPath);
        
        async function listRecursive(dir: string, depth: number = 0): Promise<string[]> {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          const files: string[] = [];
          
          for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            const relativePath = path.relative(baseDir, entryPath);
            
            // Ignorar node_modules, .git, etc
            if (/node_modules|\.git|dist|build|\.next/.test(entry.name)) continue;
            
            if (entry.isDirectory()) {
              files.push(`${relativePath}/`);
              if (recursive && depth < 5) {
                files.push(...await listRecursive(entryPath, depth + 1));
              }
            } else {
              if (!pattern || entry.name.match(new RegExp(pattern.replace('*', '.*')))) {
                files.push(relativePath);
              }
            }
          }
          
          return files;
        }
        
        const files = await listRecursive(fullPath);
        
        return JSON.stringify({
          success: true,
          path: dirPath,
          pattern: pattern || '*',
          recursive,
          count: files.length,
          files: files.slice(0, 100), // Limitar a 100 arquivos
          truncated: files.length > 100,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao listar: ${message}`,
          path: dirPath,
        });
      }
    },

    // ========================================================================
    // buildExecutionPlan - Gerar plano de execução
    // ========================================================================
    async buildExecutionPlan(params: {
      intent: string;
      objectives: string[];
      safetyLevel?: number;
      steps: ExecutionStep[];
      approver?: string;
      notes?: string;
      sources?: string[];
    }) {
      try {
        const plan = buildExecutionPlan(params);
        return JSON.stringify({ success: true, ...plan });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: `Erro ao gerar plano: ${message}` });
      }
    },

    // ========================================================================
    // indexConversation - Registrar transcript + plano
    // ========================================================================
    async indexConversation(params: {
      planId: string;
      conversation?: ConversationTurn[];
      planMarkdown?: string;
      repoPath?: string;
    }) {
      try {
        const { filePath } = await indexConversation({
          planId: params.planId,
          conversation: params.conversation || [],
          planMarkdown: params.planMarkdown,
          repoPath: params.repoPath || baseDir,
        });
        return JSON.stringify({ success: true, filePath });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({ success: false, error: `Erro ao indexar conversa: ${message}` });
      }
    },

    // ========================================================================
    // GUARDIAN FLOW TOOLS
    // ========================================================================

    // guardianFlow - Interação com sistema de segurança
    async guardianFlow({ action, intent, code, command, filePaths, reason, structuredFields, structuredSource }) {
      if (!config.guardianFlowEnabled) {
        // Guardian Flow desabilitado - BLOQUEAR execução (não aprovar silenciosamente)
        return JSON.stringify({
          success: false,
          error: 'Guardian Flow está desabilitado. Ações que requerem segurança não podem ser executadas.',
          code: 'GUARDIAN_FLOW_DISABLED',
          hint: 'Ative guardianFlowEnabled na configuração para usar este recurso.',
        });
      }

      try {
        switch (action) {
          case 'classify': {
            if (!intent) {
              return JSON.stringify({ success: false, error: 'Intent é obrigatório para classify' });
            }
            const classification = classifyIntent(intent);
            const loaConfig = LOA_CONFIGS[classification.loaLevel];
            return JSON.stringify({
              success: true,
              action: 'classify',
              result: {
                ...classification,
                loaDescription: loaConfig.description,
                requiresApproval: loaConfig.requiresExplicitApproval,
                requiresSecurityScan: loaConfig.requiresSecurityScan,
                maxBlastRadius: loaConfig.maxBlastRadius,
              },
            });
          }

          case 'validateIntent': {
            if (!intent) {
              return JSON.stringify({ success: false, error: 'Intent é obrigatório' });
            }
            const classification = classifyIntent(intent);
            // Validação simplificada - verifica confiança mínima
            const passed = classification.confidence >= 70;
            return JSON.stringify({
              success: true,
              action: 'validateIntent',
              gate: 'intent_validation',
              passed,
              confidence: classification.confidence,
              message: passed 
                ? 'Intenção validada com sucesso'
                : `Confiança insuficiente (${classification.confidence}% < 70%)`,
              detectedIntent: classification.intent,
            });
          }

          case 'checkBlastRadius': {
            const affectedFiles = filePaths || [];
            // Cálculo simplificado de blast radius
            const score = Math.min(affectedFiles.length * 10, 100);
            const passed = score <= 60; // LOA 3 limit
            return JSON.stringify({
              success: true,
              action: 'checkBlastRadius',
              gate: 'blast_radius',
              passed,
              score,
              message: passed 
                ? `Blast radius ${score}% dentro do limite`
                : `Blast radius ${score}% excede limite seguro`,
              affectedFiles: affectedFiles.length,
              riskLevel: score <= 30 ? 'low' : score <= 60 ? 'medium' : 'high',
            });
          }

          case 'runDeterministic': {
            if (!code && !command) {
              return JSON.stringify({ success: false, error: 'Informe code ou command para runDeterministic' });
            }

            // Construir comando seguro. Se code for fornecido, empacotar em node -e via base64 para evitar escape.
            const finalCommand = command
              ? command
              : (() => {
                  const b64 = Buffer.from(code || '', 'utf8').toString('base64');
                  return `node -e "const c=Buffer.from('${b64}','base64').toString('utf8'); eval(c);"`;
                })();

            const deterministic = await runDeterministicRuns({
              command: finalCommand,
              runs: 5,
              timeoutSec: 30,
              structuredFields,
              structuredSource,
            });
            const runsCompleted = deterministic.executions?.length || 0;

            return JSON.stringify({
              success: deterministic.success,
              action: 'runDeterministic',
              gate: 'deterministic_validation',
              passed: deterministic.success,
              consistency: deterministic.consistent ? 100 : 0,
              runsCompleted,
              message: deterministic.reason,
              hashSource: deterministic.hashSource,
              structuredFieldsUsed: deterministic.structuredFields,
              executions: deterministic.executions?.map((e) => ({
                exitCode: e.exitCode,
                durationMs: e.durationMs,
                hash: e.hash,
                hashSource: e.hashSource,
                structured: e.structured,
                stdoutSample: (e.stdout || '').slice(0, 4000),
                stderrSample: (e.stderr || '').slice(0, 4000),
              })),
            });
          }

          case 'securityScan': {
            const scan = await runSemgrepScan(baseDir);
            const criticalCount = scan.findings.filter((f) => (f.severity || '').toLowerCase() === 'critical').length;
            const highCount = scan.findings.filter((f) => (f.severity || '').toLowerCase() === 'high').length;
            const passed = scan.success && criticalCount === 0 && highCount === 0;

            return JSON.stringify({
              success: scan.success,
              action: 'securityScan',
              gate: 'security_scan',
              passed,
              findings: scan.findings,
              criticalCount,
              highCount,
              message: !scan.success
                ? `Falha ao rodar semgrep: ${scan.stderr || 'erro'}`
                : passed
                  ? 'Nenhuma vulnerabilidade crítica/alta encontrada'
                  : `${criticalCount + highCount} achados críticos/altos detectados`,
            });
          }

          case 'requestApproval': {
            if (!reason) {
              return JSON.stringify({ success: false, error: 'Reason é obrigatório para requestApproval' });
            }
            
            await ensureApprovalStore();
            const classification = intent ? classifyIntent(intent) : { loaLevel: 2 as LOALevel, intent: 'unknown' };
            
            // Criar aprovação REAL no store persistente
            const approval = await createApproval({
              intent: intent || 'unknown',
              loaLevel: classification.loaLevel,
              reason,
              requestedBy: config.userId,
              expiresInMs: 5 * 60 * 1000, // 5 minutos
            });
            
            return JSON.stringify({
              success: true,
              action: 'requestApproval',
              gate: 'human_approval',
              approvalId: approval.id,
              loaLevel: classification.loaLevel,
              status: approval.status,
              expiresAt: approval.expiresAt.toISOString(),
              message: `Aprovação solicitada para LOA ${classification.loaLevel}: ${reason}`,
              note: 'Use POST /api/approvals/{id}/approve ou /reject para decidir',
            });
          }

          case 'validateApproval': {
            const approvalId = (intent || '').trim();
            if (!approvalId) {
              return JSON.stringify({ success: false, error: 'approvalId é obrigatório (passe via intent)' });
            }
            
            await ensureApprovalStore();
            const validation = await validateApproval(approvalId);
            
            return JSON.stringify({
              success: validation.valid,
              action: 'validateApproval',
              gate: 'human_approval',
              approvalId,
              valid: validation.valid,
              reason: validation.reason,
              approval: validation.approval ? {
                status: validation.approval.status,
                decidedBy: validation.approval.decidedBy,
                decidedAt: validation.approval.decidedAt?.toISOString(),
              } : undefined,
            });
          }

          default:
            return JSON.stringify({
              success: false,
              error: `Ação Guardian Flow desconhecida: ${action}`,
              availableActions: ['classify', 'validateIntent', 'checkBlastRadius', 'runDeterministic', 'securityScan', 'requestApproval', 'validateApproval'],
            });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro no Guardian Flow: ${message}`,
          action,
        });
      }
    },

    // checkSafetyGates - Verificação completa de segurança
    async checkSafetyGates({ intent, affectedFiles = [], loaLevel }) {
      try {
        const classification = classifyIntent(intent);
        const effectiveLOA = (loaLevel || classification.loaLevel) as LOALevel;
        const loaConfig = LOA_CONFIGS[effectiveLOA];
        
        const gates: { name: string; passed: boolean; message: string }[] = [];

        // Gate 1: Intent Validation
        const passed = classification.confidence >= 70;
        gates.push({
          name: 'intent_validation',
          passed,
          message: passed 
            ? 'Intenção validada com sucesso'
            : `Confiança insuficiente (${classification.confidence}%)`,
        });

        // Gate 2: Blast Radius (se LOA >= 2)
        if (effectiveLOA >= 2) {
          // Cálculo REAL de blast radius baseado em dependências
          const blastAnalysis = await calculateRealBlastRadius(affectedFiles);
          const blastPassed = blastAnalysis.score <= loaConfig.maxBlastRadius;
          
          const detailsStr = blastAnalysis.details.riskFactors.length > 0
            ? ` (${blastAnalysis.details.riskFactors.map(r => r.factor).join(', ')})`
            : '';
          
          gates.push({
            name: 'blast_radius',
            passed: blastPassed,
            message: blastPassed 
              ? `Blast radius ${blastAnalysis.score}% dentro do limite${detailsStr}`
              : `Blast radius ${blastAnalysis.score}% excede limite de ${loaConfig.maxBlastRadius}%${detailsStr}`,
          });
        }

        // Gate 3: Security Scan (se configurado para o LOA)
        if (loaConfig.requiresSecurityScan) {
          // Executar scan REAL via Semgrep
          const scanResult = await runSemgrepScan(baseDir);
          const criticalCount = scanResult.findings.filter(
            (f: { severity?: string }) => (f.severity || '').toLowerCase() === 'critical'
          ).length;
          const highCount = scanResult.findings.filter(
            (f: { severity?: string }) => (f.severity || '').toLowerCase() === 'high'
          ).length;
          
          // Só passa se scan rodou com sucesso E não há findings críticos/altos
          const scanPassed = scanResult.success && criticalCount === 0 && highCount === 0;
          
          gates.push({
            name: 'security_scan',
            passed: scanPassed,
            message: !scanResult.success
              ? `Security scan falhou: ${scanResult.stderr || 'Docker/Semgrep indisponível'}`
              : scanPassed
                ? 'Security scan aprovado - nenhuma vulnerabilidade crítica/alta'
                : `Security scan encontrou ${criticalCount} críticos e ${highCount} altos`,
          });
        }

        // Gate 4: Human Approval (se LOA >= 2)
        if (loaConfig.requiresExplicitApproval) {
          gates.push({
            name: 'human_approval',
            passed: false, // Sempre pendente até aprovação
            message: `Requer aprovação humana para LOA ${effectiveLOA}`,
          });
        }

        const allPassed = gates.every(g => g.passed);
        const pendingApproval = gates.some(g => g.name === 'human_approval' && !g.passed);

        return JSON.stringify({
          success: true,
          intent: classification.intent,
          loaLevel: effectiveLOA,
          loaDescription: loaConfig.description,
          gates,
          allPassed,
          pendingApproval,
          summary: pendingApproval 
            ? `⏳ Aguardando aprovação humana (LOA ${effectiveLOA})`
            : allPassed 
              ? '✅ Todos os Safety Gates passaram - execução autorizada'
              : '❌ Um ou mais Safety Gates falharam - execução bloqueada',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao verificar Safety Gates: ${message}`,
        });
      }
    },

    // getMissions - Sistema de gamificação
    async getMissions({ category }) {
      try {
        // Missões simplificadas (em produção, usar generateDailyMissions com profile real)
        const missions = [
          {
            id: 'mission_1',
            title: 'Caça ao Code Smell',
            description: 'Elimine 3 code smells do projeto',
            category: 'cleanup',
            difficulty: 'easy',
            xpReward: 50,
            progress: 0,
            target: 3,
          },
          {
            id: 'mission_2',
            title: 'Documentador',
            description: 'Adicione JSDoc a 5 funções',
            category: 'docs',
            difficulty: 'easy',
            xpReward: 50,
            progress: 0,
            target: 5,
          },
          {
            id: 'mission_3',
            title: 'Cobertura de Testes',
            description: 'Aumente a cobertura em 5%',
            category: 'tests',
            difficulty: 'medium',
            xpReward: 100,
            progress: 0,
            target: 5,
          },
        ];
        
        let filtered = missions;
        if (category) {
          filtered = missions.filter(m => m.category === category);
        }

        const totalXP = filtered.reduce((sum, m) => sum + m.xpReward, 0);

        return JSON.stringify({
          success: true,
          count: filtered.length,
          totalPotentialXP: totalXP,
          missions: filtered.map(m => ({
            ...m,
            percentComplete: Math.round((m.progress / m.target) * 100),
          })),
          tip: 'Complete missões para ganhar XP e subir de nível no Guardian Flow!',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return JSON.stringify({
          success: false,
          error: `Erro ao obter missões: ${message}`,
        });
      }
    },
  };
}
