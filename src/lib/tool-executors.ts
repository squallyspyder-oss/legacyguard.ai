/**
 * Tool Executors - Implementação Real das Ferramentas do Agente
 * 
 * Conecta as definições de ferramentas às APIs reais do LegacyGuard.
 */

import type { ToolExecutor } from './agent-runtime';
import { getRAGIndexer } from './rag-indexer';
import { runSandbox } from './sandbox';
import fs from 'fs/promises';
import path from 'path';

export interface ExecutorConfig {
  repoPath?: string;
  sandboxEnabled: boolean;
  sandboxMode: 'fail' | 'permissive';
  workerEnabled: boolean;
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
  };
}
