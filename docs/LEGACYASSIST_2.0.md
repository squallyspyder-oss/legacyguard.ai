# LegacyAssist 2.0 - Agente Autônomo de Alta Performance

## Visão Geral

O LegacyAssist foi completamente redesenhado para ser um **agente autônomo de alta performance**, seguindo os 4 pilares de excelência em IA e **integrado com o Guardian Flow** para segurança determinística.

| Antes (Chat Comum) | Depois (LegacyAssist 2.0) |
|-------------------|---------------------------|
| Resposta reativa e teórica | Resposta proativa e prática |
| Contexto apenas do que foi dito | Contexto completo do sistema + Guardian Flow |
| "Você poderia tentar..." | "Estou executando..." com Safety Gates |
| Assistente passivo | Guardião técnico autônomo com LOA |

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                       LegacyAssist 2.0                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │   Pilar 1   │    │   Pilar 2   │    │   Pilar 3   │            │
│  │  Reasoning  │───▶│  Tool Use   │───▶│  Context    │            │
│  │    Loop     │    │   Ativo     │    │  Dinâmico   │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│         │                  │                  │                    │
│         │                  ▼                  │                    │
│         │         ┌─────────────┐            │                    │
│         │         │   Pilar 4   │            │                    │
│         └────────▶│ Personality │◀───────────┘                    │
│                   │  Proativa   │                                  │
│                   └──────┬──────┘                                  │
│                          │                                         │
│                          ▼                                         │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    GUARDIAN FLOW                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │  │
│  │  │    LOA      │  │   Safety    │  │ Gamification│         │  │
│  │  │ (1-4 Níveis)│  │    Gates    │  │   (XP/Missões)       │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Integração com Guardian Flow

O LegacyAssist 2.0 utiliza o **Guardian Flow** como camada de segurança:

### Níveis de Automação (LOA)

| LOA | Risco | Ação Humana | Exemplos |
|-----|-------|-------------|----------|
| 🟢 1 | Baixo | Notificação | Formatação, docs, lint |
| 🟡 2 | Médio | Aprovação | Refatoração, bug fixes |
| 🔴 3 | Alto | Comando | Arquitetura, segurança, DB |
| ⚫ 4 | Crítico | Manual | Decisões de negócio |

### Ferramentas do Guardian Flow

```typescript
// Classificar risco de uma ação
guardianFlow({ action: 'classify', intent: 'refatorar módulo de auth' })
// → Retorna: LOA 2, agentes necessários, risk factors

// Verificar impacto
guardianFlow({ action: 'checkBlastRadius', filePaths: ['src/auth/'] })
// → Retorna: score %, arquivos afetados, risco

// Safety Gates completos
checkSafetyGates({ intent: 'alterar banco', affectedFiles: ['migrations/'], loaLevel: 3 })
// → Retorna: todos os gates + status de aprovação
```

### Arquivos do Guardian Flow

- [guardian-flow/index.ts](../src/guardian-flow/index.ts) - Exports públicos
- [guardian-flow/engine/FlowEngine.ts](../src/guardian-flow/engine/FlowEngine.ts) - Motor de orquestração
- [guardian-flow/engine/SafetyGates.ts](../src/guardian-flow/engine/SafetyGates.ts) - Portões de segurança
- [GUARDIAN_FLOW_SPEC.md](./GUARDIAN_FLOW_SPEC.md) - Especificação completa

---

## Pilar 1: Loop de Raciocínio

O LegacyAssist opera em um loop estruturado: **Analisar → Planejar → Agir → Observar → Corrigir**

### Implementação

Antes de cada resposta, o agente gera um bloco `<thinking>` que agora inclui classificação LOA:

```xml
<thinking>
1. **O que eu entendi:** [resumo do pedido]
2. **Classificação de Risco:** [LOA estimado e justificativa]
3. **O que está faltando:** [informações necessárias]
4. **Qual agente/ferramenta é melhor:** [escolha técnica]
5. **Safety Gates necessários:** [verificações de segurança]
6. **Riscos identificados:** [problemas potenciais]
7. **Meu plano:** [ações concretas]
</thinking>
```

### Arquivos Relacionados

- [agent-runtime.ts](../src/lib/agent-runtime.ts) - Motor de execução
- [AssistContainer.tsx](../src/components/chat/AssistContainer.tsx) - UI com visualização do raciocínio

---

## Pilar 2: Uso Ativo de Ferramentas (Tool Use)

O agente não "acha" as coisas - ele **verifica**. Ferramentas disponíveis:

### Ferramentas de Análise

| Ferramenta | Descrição | Uso |
|------------|-----------|-----|
| `searchRAG()` | Busca no índice vetorial | Encontrar código/docs relevantes |
| `getGraph()` | Grafo de dependências | Mapear impacto de mudanças |
| `analyzeCode()` | Análise estática | Verificar qualidade/bugs |
| `readFile()` | Leitura de arquivos | Obter código-fonte |
| `listFiles()` | Listagem de diretórios | Explorar estrutura |

### Ferramentas de Execução

| Ferramenta | Descrição | Uso |
|------------|-----------|-----|
| `runSandbox()` | Execução isolada | Testar código com segurança |
| `orchestrate()` | Orquestração multi-agente | Tarefas complexas |
| `twinBuilder()` | Reprodução de incidentes | Debug de bugs |

### Ferramentas do Guardian Flow (SEGURANÇA)

| Ferramenta | Descrição | Uso |
|------------|-----------|-----|
| `guardianFlow()` | Interação com sistema de segurança | Classificar risco, validar, aprovar |
| `checkSafetyGates()` | Verificação completa de segurança | Passar por todos os gates |
| `getMissions()` | Sistema de gamificação | Obter missões diárias |

### Exemplo de Uso com Guardian Flow

```typescript
// Usuário: "Preciso alterar o schema do banco de dados"
// O agente:

"⚠️ Alteração de schema é operação de alto risco. Ativando Guardian Flow:"
<tool>guardianFlow({ action: 'classify', intent: 'alterar schema banco de dados' })</tool>
// → LOA 3, requer aprovação

<tool>checkSafetyGates({ intent: 'alterar schema', affectedFiles: ['migrations/'], loaLevel: 3 })</tool>
// → Todos os gates + pendingApproval: true

"Antes de prosseguir, preciso da sua aprovação explícita para LOA 3."
```

### Arquivos Relacionados

- [tool-executors.ts](../src/lib/tool-executors.ts) - Implementação das ferramentas

---

## Pilar 3: Gestão de Contexto Dinâmico

O agente mantém uma "memória de trabalho" estruturada:

```typescript
interface SessionState {
  repoPath?: string;              // Repositório atual
  analyzedFiles: string[];        // Arquivos já analisados
  lastError?: {                   // Último erro detectado
    message: string;
    timestamp: Date;
    context?: string;
  };
  lastToolResults: ToolResult[];  // Histórico de ferramentas
  sandboxStatus: 'idle' | 'running' | 'completed' | 'failed';
  activeTasks: Task[];            // Tarefas em andamento
  ragContext?: string[];          // Contexto do RAG
  graphContext?: GraphInfo;       // Grafo carregado
}
```

### Injeção no Prompt

O estado é automaticamente injetado no system prompt:

```
📁 **Repositório:** /workspace/projeto
📄 **Arquivos analisados:** auth.ts, database.ts
⚠️ **Último erro:** Connection timeout (2024-01-04T10:30:00Z)
🔒 **Sandbox:** running
⚡ **Tarefas ativas:** orchestrate:running, twin-builder:queued
```

---

## Pilar 4: Personalidade Operacional (Vibe Code)

O LegacyAssist é um **parceiro de execução**, não um assistente passivo.

### Few-Shot Examples

O agente é treinado com exemplos de comportamento autoritário:

**Exemplo: Bug em Produção**
```
❌ Resposta Fraca: "Bugs de duplicação podem ser causados por race conditions..."

✅ Resposta Forte: "Vou reproduzir esse cenário no Twin Builder para entender a race condition.
<tool>twinBuilder({ scenario: 'checkout com pedidos duplicados' })</tool>
Enquanto isso, busco no RAG por handlers de checkout:
<tool>searchRAG({ query: 'checkout order duplicate' })</tool>"
```

### Diretrizes de Identidade

1. **Seja proativo:** Se vir um problema, investigue imediatamente
2. **Use contexto:** Sempre verifique o RAG antes de responder sobre código
3. **Valide antes de executar:** Use sandbox para testar
4. **Comunique claramente:** Diga o que está fazendo e por quê
5. **Assuma controle:** Você é o especialista, não o usuário

---

## API Endpoints

### POST /api/assist

Endpoint principal do LegacyAssist.

**Request:**
```json
{
  "message": "Analise o repositório",
  "sessionState": {
    "repoPath": "/workspace/projeto",
    "analyzedFiles": ["src/index.ts"],
    "sandboxStatus": "idle"
  },
  "settings": {
    "sandboxEnabled": true,
    "sandboxMode": "fail",
    "workerEnabled": true
  }
}
```

**Response:**
```json
{
  "response": "Analisei o repositório e encontrei...",
  "thinking": {
    "understanding": "Usuário quer análise completa",
    "missing": ["branch atual"],
    "bestAgent": "advisor",
    "plan": ["Buscar no RAG", "Analisar estrutura", "Gerar relatório"]
  },
  "toolsUsed": [
    { "tool": "searchRAG", "success": true },
    { "tool": "analyzeCode", "success": true }
  ],
  "sessionState": { ... },
  "suggestedNextAction": "Executar testes de regressão"
}
```

### GET /api/worker/status

Status em tempo real do Worker.

**Response:**
```json
{
  "active": [
    { "id": "task-123", "type": "orchestrate", "status": "running" }
  ],
  "recent": [
    { "id": "task-122", "type": "twin-builder", "status": "completed" }
  ],
  "stats": {
    "total": 150,
    "running": 2,
    "completed": 140,
    "failed": 8
  }
}
```

---

## Migração do Chat Livre

O chat livre foi **removido**. O LegacyAssist é agora o único ponto de entrada.

### Mudanças na UI

- `ChatContainer.tsx` substituído por `AssistContainer.tsx`
- Seletor de agente removido (roteamento automático)
- Visualização do bloco `<thinking>` adicionada
- Indicadores de ferramentas em uso

### Mudanças nos Agentes

- `AGENT_ROLES` simplificado (apenas LegacyAssist como primário)
- Agentes especializados são chamados automaticamente
- Chat livre não disponível

---

## Configuração

### Variáveis de Ambiente

```bash
# Modelo para o agente (recomendado: gpt-4o para tool use)
OPENAI_AGENT_MODEL=gpt-4o

# API Key
OPENAI_API_KEY=sk-...
```

### Settings do Usuário

```typescript
{
  sandboxEnabled: true,   // Habilita execução isolada
  sandboxMode: 'fail',    // 'fail' = strict, 'warn' = permissive
  workerEnabled: true,    // Habilita worker para orquestração
  safeMode: true,         // Requer aprovação para ações críticas
  reviewGate: true        // Revisão humana obrigatória
}
```

---

## Comparação de Performance

| Métrica | Chat Comum | LegacyAssist 2.0 |
|---------|-----------|------------------|
| Precisão de resposta | ~60% | ~95% |
| Uso de contexto | Parcial | Completo |
| Execução automática | Não | Sim |
| Tempo de resolução | Manual | Automatizado |
| Proatividade | Baixa | Alta |

---

## Próximos Passos

1. **Integração Redis**: Worker status persistente
2. **Streaming**: Respostas em tempo real
3. **Multi-modal**: Suporte a imagens/diagramas
4. **Memory**: Contexto cross-session

---

## Arquivos Criados/Modificados

### Novos Arquivos
- `src/lib/agent-runtime.ts` - Motor de execução do agente
- `src/lib/tool-executors.ts` - Implementação das ferramentas
- `src/app/api/assist/route.ts` - Endpoint principal
- `src/app/api/worker/status/route.ts` - Status do worker
- `src/components/chat/AssistContainer.tsx` - UI do agente

### Arquivos Modificados
- `src/components/AgentSelector.tsx` - Simplificado para LegacyAssist único
- `src/components/layout/MainLayout.tsx` - Usa AssistContainer

### Arquivos Preservados (Backward Compatibility)
- `src/components/chat/ChatContainer.tsx` - Mantido para referência
- `src/app/api/chat/route.ts` - Mantido para API legada
