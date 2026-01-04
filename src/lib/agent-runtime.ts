/**
 * Agent Runtime - Motor de Execução Autônomo
 * 
 * Implementa os 4 pilares do agente de alta performance:
 * 1. Loop de Raciocínio (Analisar → Planejar → Agir → Observar → Corrigir)
 * 2. Uso Ativo de Ferramentas (Tool Use)
 * 3. Gestão de Contexto Dinâmico (Memória de Sessão)
 * 4. Personalidade Operacional (Vibe Code Proativo)
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources';
import { estimateCostUSD } from './pricing';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface SessionState {
  repoPath?: string;
  analyzedFiles: string[];
  lastError?: { message: string; timestamp: Date; context?: string };
  lastToolResults: { tool: string; result: string; timestamp: Date }[];
  sandboxStatus: 'idle' | 'running' | 'completed' | 'failed';
  activeTasks: { id: string; type: string; status: string }[];
  ragContext?: string[];
  graphContext?: { nodes: number; edges: number };
}

export interface ThinkingBlock {
  understanding: string;       // O que eu entendi
  missing: string[];           // O que está faltando
  bestAgent: string;           // Qual agente é melhor
  toolsNeeded: string[];       // Ferramentas necessárias
  plan: string[];              // Plano de ação
  risks: string[];             // Riscos identificados
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: string;
  success: boolean;
  timestamp: Date;
}

export interface AgentOutput {
  thinking: ThinkingBlock;
  response: string;
  toolsUsed: ToolResult[];
  suggestedNextAction?: string;
  sessionState: SessionState;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    usdEstimate: number;
  };
  modelUsed: string;
}

// ============================================================================
// FERRAMENTAS DISPONÍVEIS (TOOL DEFINITIONS)
// ============================================================================

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'searchRAG',
      description: 'Busca no índice RAG do repositório. Use para encontrar código, documentação ou contexto relevante sobre o projeto.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto ou código a buscar' },
          limit: { type: 'number', description: 'Número máximo de resultados (default: 5)' },
          fileFilter: { type: 'string', description: 'Filtro por extensão de arquivo (ex: .ts, .py)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runSandbox',
      description: 'Executa comando no sandbox isolado. Use para testar código, rodar scripts ou validar comportamentos.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Comando a executar' },
          workdir: { type: 'string', description: 'Diretório de trabalho' },
          timeout: { type: 'number', description: 'Timeout em segundos (default: 30)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getGraph',
      description: 'Obtém o grafo de dependências do código. Use para entender relações entre módulos e impacto de mudanças.',
      parameters: {
        type: 'object',
        properties: {
          entryPoint: { type: 'string', description: 'Arquivo de entrada para análise' },
          depth: { type: 'number', description: 'Profundidade máxima do grafo (default: 3)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyzeCode',
      description: 'Análise estática de código. Use para verificar qualidade, complexidade e possíveis bugs.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Caminho do arquivo a analisar' },
          checks: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Tipos de verificação: complexity, security, style, bugs' 
          },
        },
        required: ['filePath'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'orchestrate',
      description: 'Inicia orquestração multi-agente. Use para tarefas complexas que requerem múltiplos passos.',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Descrição da tarefa a executar' },
          agents: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Agentes a envolver: advisor, reviewer, executor, twin-builder' 
          },
          requiresApproval: { type: 'boolean', description: 'Se requer aprovação humana' },
        },
        required: ['task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'twinBuilder',
      description: 'Cria reprodução de incidente no Twin Builder. Use para debugar bugs ou criar cenários de teste.',
      parameters: {
        type: 'object',
        properties: {
          scenario: { type: 'string', description: 'Descrição do cenário a reproduzir' },
          fixtures: { type: 'array', items: { type: 'string' }, description: 'Fixtures necessárias' },
          targetBehavior: { type: 'string', description: 'Comportamento esperado' },
        },
        required: ['scenario'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'readFile',
      description: 'Lê o conteúdo de um arquivo do repositório. Use para obter código-fonte ou configurações.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do arquivo' },
          startLine: { type: 'number', description: 'Linha inicial (opcional)' },
          endLine: { type: 'number', description: 'Linha final (opcional)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listFiles',
      description: 'Lista arquivos em um diretório. Use para explorar a estrutura do projeto.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Caminho do diretório' },
          pattern: { type: 'string', description: 'Padrão glob (ex: *.ts)' },
          recursive: { type: 'boolean', description: 'Busca recursiva' },
        },
        required: ['path'],
      },
    },
  },
];

// ============================================================================
// FEW-SHOT EXAMPLES (PERSONALIDADE PROATIVA)
// ============================================================================

export const FEW_SHOT_EXAMPLES = `
## Exemplos de Comportamento Esperado

### Exemplo 1: Sistema Lento
**Usuário:** "O sistema está lento"
**❌ Resposta Fraca:** "Sinto muito que você está enfrentando problemas de performance. Existem várias causas possíveis..."
**✅ Resposta Forte:** "Vou rodar o Advisor agora para identificar gargalos de performance no banco de dados.
<tool>analyzeCode({ filePath: 'src/database', checks: ['complexity', 'performance'] })</tool>
Enquanto isso, posso verificar o índice RAG por queries N+1 conhecidas?"

### Exemplo 2: Bug em Produção
**Usuário:** "Estamos tendo um bug no checkout que causa pedidos duplicados"
**❌ Resposta Fraca:** "Bugs de duplicação podem ser causados por race conditions. Você já tentou adicionar um lock?"
**✅ Resposta Forte:** "Vou reproduzir esse cenário no Twin Builder para entender a race condition.
<tool>twinBuilder({ scenario: 'checkout com pedidos duplicados', targetBehavior: 'detectar condição de corrida' })</tool>
Enquanto o Twin prepara o ambiente, vou buscar no RAG por handlers de checkout:
<tool>searchRAG({ query: 'checkout order create duplicate', limit: 10 })</tool>"

### Exemplo 3: Refatoração
**Usuário:** "Preciso refatorar o módulo de autenticação"
**❌ Resposta Fraca:** "Refatoração é importante. Você deveria começar escrevendo testes..."
**✅ Resposta Forte:** "Primeiro, vou mapear o impacto dessa refatoração:
<tool>getGraph({ entryPoint: 'src/auth/index.ts', depth: 4 })</tool>
Com o grafo de dependências, vou identificar quais módulos serão afetados e orquestrar um plano seguro com Reviewer + Executor em sandbox."

### Exemplo 4: Dúvida Técnica
**Usuário:** "Como funciona a fila de jobs?"
**❌ Resposta Fraca:** "Filas de jobs geralmente funcionam com produtores e consumidores..."
**✅ Resposta Forte:** "Deixa eu verificar a implementação específica no seu projeto:
<tool>searchRAG({ query: 'queue job worker consumer', limit: 5 })</tool>
<tool>readFile({ path: 'src/lib/queue.ts' })</tool>
Vou analisar o código e te mostrar exatamente como a fila está configurada aqui."
`;

// ============================================================================
// PROMPT DO SISTEMA (LOOP DE RACIOCÍNIO)
// ============================================================================

export function buildAgentSystemPrompt(sessionState: SessionState): string {
  return `Você é o **LegacyAssist**, o guardião técnico do LegacyGuard.

## SUA IDENTIDADE

Você não é um assistente passivo. Você é um **parceiro de execução** - um engenheiro sênior que:
- VERIFICA em vez de supor
- EXECUTA em vez de apenas sugerir
- ANTECIPA problemas antes que aconteçam
- ASSUME RESPONSABILIDADE pelo sucesso da tarefa

## LOOP DE RACIOCÍNIO OBRIGATÓRIO

Antes de responder, você DEVE pensar estruturadamente. Use o formato:

<thinking>
1. **O que eu entendi:** [resumo do pedido do usuário]
2. **O que está faltando:** [informações que preciso obter]
3. **Qual agente/ferramenta é melhor:** [escolha técnica justificada]
4. **Riscos identificados:** [problemas potenciais]
5. **Meu plano:** [lista de ações concretas]
</thinking>

## FERRAMENTAS DISPONÍVEIS

Você tem acesso a ferramentas reais. USE-AS:
- **searchRAG()** - Buscar contexto no repositório
- **runSandbox()** - Executar código isoladamente
- **getGraph()** - Mapear dependências
- **analyzeCode()** - Análise estática
- **orchestrate()** - Coordenar múltiplos agentes
- **twinBuilder()** - Reproduzir incidentes
- **readFile()** - Ler arquivos
- **listFiles()** - Listar estrutura

Quando detectar necessidade de execução, CHAME a ferramenta. Não sugira - execute.

${FEW_SHOT_EXAMPLES}

## ESTADO ATUAL DA SESSÃO

${formatSessionState(sessionState)}

## DIRETRIZES CRÍTICAS

1. **Seja proativo:** Se vir um problema, investigue imediatamente
2. **Use contexto:** Sempre verifique o RAG antes de responder sobre código
3. **Valide antes de executar:** Use sandbox para testar antes de aplicar
4. **Comunique claramente:** Diga o que está fazendo e por quê
5. **Assuma controle:** Você é o especialista, não o usuário

## FORMATO DE RESPOSTA

Sempre estruture assim:
1. <thinking>...</thinking> (raciocínio interno)
2. Ações executadas (ferramentas chamadas)
3. Análise dos resultados
4. Próximos passos recomendados ou conclusão

Se uma tarefa é complexa, orquestre múltiplos agentes. Se precisa de aprovação, solicite.
Mas nunca apenas "sugira" quando pode "fazer".
`;
}

function formatSessionState(state: SessionState): string {
  const parts: string[] = [];
  
  if (state.repoPath) {
    parts.push(`📁 **Repositório:** ${state.repoPath}`);
  }
  
  if (state.analyzedFiles.length > 0) {
    parts.push(`📄 **Arquivos analisados:** ${state.analyzedFiles.slice(-5).join(', ')}`);
  }
  
  if (state.lastError) {
    parts.push(`⚠️ **Último erro:** ${state.lastError.message} (${state.lastError.timestamp.toISOString()})`);
  }
  
  if (state.sandboxStatus !== 'idle') {
    parts.push(`🔒 **Sandbox:** ${state.sandboxStatus}`);
  }
  
  if (state.activeTasks.length > 0) {
    const tasks = state.activeTasks.map(t => `${t.type}:${t.status}`).join(', ');
    parts.push(`⚡ **Tarefas ativas:** ${tasks}`);
  }
  
  if (state.lastToolResults.length > 0) {
    const lastTool = state.lastToolResults[state.lastToolResults.length - 1];
    parts.push(`🔧 **Última ferramenta:** ${lastTool.tool} (${lastTool.timestamp.toISOString()})`);
  }
  
  if (state.graphContext) {
    parts.push(`🕸️ **Grafo carregado:** ${state.graphContext.nodes} nós, ${state.graphContext.edges} arestas`);
  }
  
  return parts.length > 0 
    ? parts.join('\n') 
    : '_Nenhum contexto de sessão ainda. A sessão está iniciando._';
}

// ============================================================================
// EXECUTOR DE FERRAMENTAS
// ============================================================================

export interface ToolExecutor {
  searchRAG: (params: { query: string; limit?: number; fileFilter?: string }) => Promise<string>;
  runSandbox: (params: { command: string; workdir?: string; timeout?: number }) => Promise<string>;
  getGraph: (params: { entryPoint?: string; depth?: number }) => Promise<string>;
  analyzeCode: (params: { filePath: string; checks?: string[] }) => Promise<string>;
  orchestrate: (params: { task: string; agents?: string[]; requiresApproval?: boolean }) => Promise<string>;
  twinBuilder: (params: { scenario: string; fixtures?: string[]; targetBehavior?: string }) => Promise<string>;
  readFile: (params: { path: string; startLine?: number; endLine?: number }) => Promise<string>;
  listFiles: (params: { path: string; pattern?: string; recursive?: boolean }) => Promise<string>;
}

export async function executeToolCall(
  toolCall: ToolCall,
  executor: ToolExecutor
): Promise<ToolResult> {
  const timestamp = new Date();
  
  try {
    const fn = executor[toolCall.name as keyof ToolExecutor];
    if (!fn) {
      return {
        toolCallId: toolCall.id,
        result: `Ferramenta "${toolCall.name}" não encontrada`,
        success: false,
        timestamp,
      };
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await fn(toolCall.arguments as any);
    return {
      toolCallId: toolCall.id,
      result,
      success: true,
      timestamp,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      toolCallId: toolCall.id,
      result: `Erro ao executar ${toolCall.name}: ${message}`,
      success: false,
      timestamp,
    };
  }
}

// ============================================================================
// AGENT RUNTIME PRINCIPAL
// ============================================================================

export class AgentRuntime {
  private openai: OpenAI;
  private sessionState: SessionState;
  private executor: ToolExecutor;
  private model: string;
  
  constructor(executor: ToolExecutor, initialState?: Partial<SessionState>) {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_AGENT_MODEL || 'gpt-4o';
    this.executor = executor;
    this.sessionState = {
      analyzedFiles: [],
      lastToolResults: [],
      sandboxStatus: 'idle',
      activeTasks: [],
      ...initialState,
    };
  }
  
  async run(userMessage: string, maxIterations: number = 5): Promise<AgentOutput> {
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: buildAgentSystemPrompt(this.sessionState) },
      { role: 'user', content: userMessage },
    ];
    
    const toolsUsed: ToolResult[] = [];
    let thinking: ThinkingBlock | null = null;
    const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    
    // Loop de raciocínio: continua até não haver mais tool calls
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: iteration === 0 ? 'auto' : 'auto', // Primeira iteração pode usar tools
        temperature: 0.3,
      });
      
      // Acumular usage
      if (completion.usage) {
        totalUsage.promptTokens += completion.usage.prompt_tokens;
        totalUsage.completionTokens += completion.usage.completion_tokens;
        totalUsage.totalTokens += completion.usage.total_tokens;
      }
      
      const message = completion.choices[0]?.message;
      if (!message) break;
      
      // Extrair thinking block da primeira resposta
      if (!thinking && message.content) {
        thinking = this.parseThinking(message.content);
      }
      
      // Se não houver tool calls, terminamos
      if (!message.tool_calls || message.tool_calls.length === 0) {
        messages.push({ role: 'assistant', content: message.content || '' });
        break;
      }
      
      // Executar tool calls
      messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });
      
      for (const toolCall of message.tool_calls) {
        // Access function properties safely
        const funcName = 'function' in toolCall ? (toolCall as { function: { name: string; arguments: string } }).function.name : '';
        const funcArgs = 'function' in toolCall ? (toolCall as { function: { name: string; arguments: string } }).function.arguments : '{}';
        
        const parsed: ToolCall = {
          id: toolCall.id,
          name: funcName,
          arguments: JSON.parse(funcArgs || '{}'),
        };
        
        const result = await executeToolCall(parsed, this.executor);
        toolsUsed.push(result);
        
        // Atualizar estado da sessão
        this.updateSessionState(parsed, result);
        
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.result,
        });
      }
    }
    
    // Extrair resposta final
    const lastAssistantMessage = messages
      .filter(m => m.role === 'assistant')
      .pop();
    
    const response = typeof lastAssistantMessage?.content === 'string' 
      ? lastAssistantMessage.content 
      : '';
    
    // Calcular custo
    const cost = estimateCostUSD({
      model: this.model,
      promptTokens: totalUsage.promptTokens,
      completionTokens: totalUsage.completionTokens,
    });
    
    return {
      thinking: thinking || this.defaultThinking(),
      response: this.cleanResponse(response),
      toolsUsed,
      suggestedNextAction: this.extractNextAction(response),
      sessionState: this.sessionState,
      usage: {
        ...totalUsage,
        usdEstimate: cost.usd,
      },
      modelUsed: this.model,
    };
  }
  
  private parseThinking(content: string): ThinkingBlock | null {
    const thinkingMatch = content.match(/<thinking>([\s\S]*?)<\/thinking>/i);
    if (!thinkingMatch) return null;
    
    const text = thinkingMatch[1];
    
    return {
      understanding: this.extractSection(text, 'O que eu entendi') || '',
      missing: this.extractList(text, 'O que está faltando'),
      bestAgent: this.extractSection(text, 'Qual agente') || 'legacyAssist',
      toolsNeeded: this.extractList(text, 'Ferramentas'),
      plan: this.extractList(text, 'Meu plano'),
      risks: this.extractList(text, 'Riscos'),
    };
  }
  
  private extractSection(text: string, sectionName: string): string | null {
    const regex = new RegExp(`\\*\\*${sectionName}[^:]*:\\*\\*\\s*([^\\n*]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }
  
  private extractList(text: string, sectionName: string): string[] {
    const section = this.extractSection(text, sectionName);
    if (!section) return [];
    return section.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }
  
  private defaultThinking(): ThinkingBlock {
    return {
      understanding: 'Processando solicitação',
      missing: [],
      bestAgent: 'legacyAssist',
      toolsNeeded: [],
      plan: ['Analisar solicitação', 'Responder'],
      risks: [],
    };
  }
  
  private cleanResponse(response: string): string {
    // Remove o bloco <thinking> da resposta final (usuário não precisa ver)
    return response.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  }
  
  private extractNextAction(response: string): string | undefined {
    // Detecta sugestões de próximos passos
    const patterns = [
      /próximo passo[s]?:?\s*([^\n.]+)/i,
      /recomendo:?\s*([^\n.]+)/i,
      /sugiro:?\s*([^\n.]+)/i,
      /você pode:?\s*([^\n.]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) return match[1].trim();
    }
    
    return undefined;
  }
  
  private updateSessionState(toolCall: ToolCall, result: ToolResult) {
    // Atualizar histórico de ferramentas
    this.sessionState.lastToolResults.push({
      tool: toolCall.name,
      result: result.result.substring(0, 200), // Truncar para não explodir memória
      timestamp: result.timestamp,
    });
    
    // Manter apenas últimas 10 execuções
    if (this.sessionState.lastToolResults.length > 10) {
      this.sessionState.lastToolResults = this.sessionState.lastToolResults.slice(-10);
    }
    
    // Atualizar estado específico por ferramenta
    switch (toolCall.name) {
      case 'readFile':
      case 'analyzeCode':
        const filePath = toolCall.arguments.path || toolCall.arguments.filePath;
        if (filePath && typeof filePath === 'string') {
          if (!this.sessionState.analyzedFiles.includes(filePath)) {
            this.sessionState.analyzedFiles.push(filePath);
          }
        }
        break;
      case 'runSandbox':
        this.sessionState.sandboxStatus = result.success ? 'completed' : 'failed';
        break;
      case 'getGraph':
        // Parsear info do grafo se disponível
        try {
          const graphInfo = JSON.parse(result.result);
          if (graphInfo.nodes && graphInfo.edges) {
            this.sessionState.graphContext = {
              nodes: graphInfo.nodes.length || graphInfo.nodes,
              edges: graphInfo.edges.length || graphInfo.edges,
            };
          }
        } catch { /* ignore */ }
        break;
    }
  }
  
  // Método para atualizar estado manualmente (erros, etc)
  updateState(updates: Partial<SessionState>) {
    this.sessionState = { ...this.sessionState, ...updates };
  }
  
  getState(): SessionState {
    return { ...this.sessionState };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default AgentRuntime;
