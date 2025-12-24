# 🛡️ LegacyGuard Console

**Plataforma de orquestração de agentes AI para manutenção segura de código legado.**

LegacyGuard é uma solução Next.js/TypeScript que coordena múltiplos agentes especializados (análise, refatoração, revisão, execução) com foco em **segurança**, **auditoria** e **controle humano**. Inclui:

- 🧭 **LegacyAssist** — Modo guiado que orienta o usuário passo a passo, sugere pesquisas (RAG/Web/Brainstorm) e valida ações antes de qualquer execução
- 🎭 **Orquestrador Multi-Agente** — Planner cria planos, waves executam em paralelo, aprovação humana obrigatória para ações de risco
- 🧪 **Twin Builder** — Reproduz incidentes em ambiente controlado, gera harness de testes e fixtures sintéticas
- 🔒 **Sandbox Isolado** — Execução em container Docker com políticas de rede/FS/recursos (strict/permissive)
- 📊 **Auditoria Estruturada** — Logs, evidências (comandos, diffs, testes, findings, approvals, rollback plans) e export JSON/CSV
- 🛡️ **Guardrails** — RBAC, rate limiting, aprovação forçada para risco alto/crítico, mascaramento de secrets

## Quick Start

```bash
# Instalar dependências
npm install

# Dev (Linux/Mac)
npm run dev

# Dev (Windows - desabilita Turbopack)
npm run dev:win

# Worker (em outro terminal)
npm run worker

# Testes
npm test

# Testes com sandbox real (requer WSL/Docker)
# Abra terminal WSL, navegue até o projeto e:
chmod +x scripts/runner_sandbox.sh
export LEGACYGUARD_SANDBOX_ENABLED=true
npm test
```

## Variáveis de Ambiente

```env
# Obrigatórias
OPENAI_API_KEY=sk-...
NEXTAUTH_SECRET=sua-secret-key
NEXTAUTH_URL=http://localhost:3000

# GitHub OAuth (para login)
GITHUB_ID=seu-github-client-id
GITHUB_SECRET=seu-github-client-secret

# Redis (fila de tarefas)
REDIS_URL=redis://localhost:6379

# Postgres (auditoria + RAG)
AUDIT_DB_URL=postgres://user:pass@host:5432/legacyguard
# ou PGVECTOR_URL se usando pgvector

# Sandbox (opcional)
LEGACYGUARD_SANDBOX_ENABLED=true
LEGACYGUARD_SANDBOX_REPO_PATH=/workspace/legacyguard
LEGACYGUARD_SANDBOX_COMMAND=npm test
LEGACYGUARD_SANDBOX_RUNNER=/workspace/legacyguard/scripts/runner_sandbox.sh
LEGACYGUARD_SANDBOX_TIMEOUT_MS=900000

# Modelos (opcional)
OPENAI_CHEAP_MODEL=gpt-4o-mini
OPENAI_DEEP_MODEL=gpt-4o
```

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                        LegacyGuard UI                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ ChatInterface│  │AgentSelector │  │  SettingsSidebar     │  │
│  │ (LegacyAssist│  │ (modo/role)  │  │  (config/tema)       │  │
│  │  + Messages) │  │              │  │                      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         API Routes                              │
│  /api/agents  │  /api/chat  │  /api/audit/export  │ /api/index │
│    (RBAC)     │   (RBAC)    │  (RBAC + filters)   │   (RAG)    │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │   Redis    │  │  Postgres  │  │   OpenAI   │
       │  (queue)   │  │  (audit)   │  │  (LLMs)    │
       └────────────┘  └────────────┘  └────────────┘
              │
              ▼
       ┌────────────────────────────────────────────┐
       │              Agent Worker                  │
       │  Orchestrator → Planner → Agents → Sandbox │
       └────────────────────────────────────────────┘
```

## Componentes

### UI (`src/components/`)
| Arquivo | Descrição |
|---------|-----------|
| `ChatInterface.tsx` | Chat principal com LegacyAssist, mensagens tipadas, suporte a Twin Builder |
| `AgentSelector.tsx` | Seletor de modo: LegacyAssist, Orquestração, Chat econômico/profundo |
| `SettingsSidebar.tsx` | Configurações de tema, modelo, sandbox |

### Agentes (`src/agents/`)
| Agente | Descrição |
|--------|-----------|
| `planner.ts` | Gera plano com waves, riskLevel (low→critical), força aprovação para alto/crítico |
| `orchestrator.ts` | Coordena waves, guarda runtime de aprovação, emite tail com risk + rollback |
| `advisor.ts` | Análise de código, sugestões de refatoração |
| `reviewer.ts` | Code review, validação de patches |
| `executor.ts` | Aplica patches, cria PRs (requer aprovação) |
| `operator.ts` | Operações de infraestrutura |
| `chat.ts` | Chat livre econômico/profundo |
| `twin-builder.ts` | Reproduz incidentes, gera harness/fixtures |

### Analyzers (`src/analyzers/`)
| Analyzer | Descrição |
|----------|-----------|
| `legacy-profiler.ts` | Detecta padrões legados, dívida técnica |
| `behavior-classifier.ts` | Classifica comportamento de código |
| `harness-generator.ts` | Gera test harness para código legado |

### APIs (`src/app/api/`)
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/agents` | POST | Enfileira tarefas (RBAC: orchestrate/approve/execute) |
| `/api/agents/stream` | GET | SSE de progresso em tempo real |
| `/api/agents/logs` | GET | Logs de sessão |
| `/api/chat` | POST | Chat livre (RBAC: chat permission) |
| `/api/audit/export` | GET | Export JSON/CSV com filtros (RBAC: audit:export) |
| `/api/index` | POST | Indexação de repositório (RAG) |
| `/api/incidents/*` | POST | Ingestão de incidentes (Datadog, Sentry, OTEL) |
| `/api/config` | GET | Configuração do cliente |
| `/api/metrics` | GET | Métricas de uso |

### Bibliotecas (`src/lib/`)
| Módulo | Descrição |
|--------|-----------|
| `audit.ts` | Logs estruturados, evidências tipadas, export DB/memory |
| `rbac.ts` | Role-based access control com permissions granulares |
| `sandbox.ts` | Isolamento Docker (strict/permissive), políticas de rede/FS/recursos |
| `secrets.ts` | Mascaramento automático de tokens/secrets |
| `queue.ts` | Fila Redis para workers |
| `rate-limit.ts` | Rate limiting por IP/usuário |
| `pricing.ts` | Estimativa de custo por modelo/tokens |
| `indexer.ts` / `indexer-pgvector.ts` | RAG com pgvector |
| `playbook-dsl.ts` | DSL para playbooks de automação |
## Fluxos Principais

### 🧭 LegacyAssist (modo guiado)
1. Usuário seleciona "LegacyAssist" no `AgentSelector`
2. Sistema apresenta opções de pesquisa (RAG, Web, Brainstorm)
3. Cada etapa é validada antes de prosseguir
4. Sugestões contextuais baseadas no código/incidente
5. Twin Builder pode ser acionado para reproduzir problemas

### 🎭 Orquestração Completa
1. UI aciona `/api/agents` com `role: "orchestrate"`
2. **Planner** analisa e gera plano com:
   - Waves (execução paralela)
   - `riskLevel`: low | medium | high | critical
   - `requiresApproval`: forçado `true` para high/critical
   - `sandboxPhase`: pre | post | both | none
3. **Orchestrator** executa waves com aprovação humana quando requerida
4. SSE em `/api/agents/stream` atualiza UI em tempo real
5. **Stream tail** inclui: `riskLevel`, `rollbackPlan` (preview 200 chars)

### 💬 Chat Livre
- `role: "chat"` chama `/api/chat` diretamente (sem fila)
- Modelo econômico por padrão; toggle "Pesquisa profunda" usa modelo maior
- Heurística sugere escalar para orquestração ao detectar intenção de ação

### 🧪 Twin Builder
1. Incidente ingestado via `/api/incidents/*` (Datadog, Sentry, OTEL)
2. `twin-builder.ts` analisa stacktrace e contexto
3. Gera harness de teste + fixtures sintéticas
4. Executa em sandbox isolado para reproduzir comportamento

## Segurança e Controles

### 🔐 RBAC (Role-Based Access Control)
```typescript
// Roles e permissões definidas em src/lib/rbac.ts
const permissions = {
  admin:    ['orchestrate', 'approve', 'execute', 'chat', 'audit:export', '*'],
  operator: ['orchestrate', 'approve', 'chat'],
  viewer:   ['chat'],
};
```

### ✅ Aprovação Obrigatória
- Planner força `requiresApproval: true` para `riskLevel: high | critical`
- Orchestrator valida em runtime antes de executar ações de risco
- UI exibe botão de aprovação; usuário deve confirmar explicitamente

### 🔒 Sandbox Isolado
```typescript
// Perfis de isolamento em src/lib/sandbox.ts
type IsolationProfile = 'strict' | 'permissive';

// Políticas configuráveis:
networkPolicy: 'none' | 'bridge'  // rede do container
fsPolicy: 'readonly' | 'readwrite' // filesystem
memoryLimit: string               // ex: '512m'
cpuLimit: string                  // ex: '1.0'
tmpfsSizeMb: number               // RAM disk para /tmp

// Docker args aplicados:
// --pids-limit=256, --security-opt no-new-privileges, --cap-drop=ALL
```

### 📊 Auditoria Estruturada
```typescript
// Tipos de evidência em src/lib/audit.ts
type AuditEvidenceInput =
  | AuditCommandRun   // { type: 'command', command, exitCode, stdout, stderr }
  | AuditDiff         // { type: 'diff', filePath, before, after }
  | AuditTestResult   // { type: 'test', framework, passed, failed, skipped, duration }
  | AuditFinding      // { type: 'finding', tool, severity, message, location }
  | AuditApproval     // { type: 'approval', approvedBy, reason, timestamp }
  | { type: 'rollback_plan', steps: string[] };
```

### 🛡️ Mascaramento de Secrets
- Tokens GitHub/OpenAI mascarados automaticamente em logs e SSE
- Pattern matching para API keys, passwords, tokens
- Configurável em `src/lib/secrets.ts`

## Configuração / Env

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `OPENAI_API_KEY` | API key OpenAI | `sk-...` |
| `OPENAI_CHEAP_MODEL` | Modelo econômico | `gpt-4o-mini` |
| `OPENAI_DEEP_MODEL` | Modelo profundo | `gpt-4o` |
| `NEXTAUTH_SECRET` | Secret para NextAuth | UUID |
| `NEXTAUTH_URL` | URL da aplicação | `http://localhost:3000` |
| `GITHUB_ID` | OAuth Client ID | GitHub App |
| `GITHUB_SECRET` | OAuth Client Secret | GitHub App |
| `REDIS_URL` | URL do Redis | `redis://localhost:6379` |
| `AUDIT_DB_URL` | Postgres para auditoria | `postgres://...` |
| `PGVECTOR_URL` | Postgres + pgvector (RAG) | `postgres://...` |
| `LEGACYGUARD_SANDBOX_ENABLED` | Habilitar sandbox | `true` |
| `LEGACYGUARD_SANDBOX_REPO_PATH` | Path do repo no sandbox | `/workspace/repo` |
| `LEGACYGUARD_SANDBOX_COMMAND` | Comando de teste | `npm test` |
| `LEGACYGUARD_SANDBOX_TIMEOUT_MS` | Timeout do sandbox | `900000` |

## API de Export de Auditoria

```bash
# GET /api/audit/export
# Requer RBAC: audit:export permission

# Parâmetros de filtro:
?format=json|csv           # formato de saída
&severity=info|warn|error  # filtrar por severidade
&action=orchestrate|approve|execute|chat  # filtrar por ação
&since=2024-01-01          # logs após esta data
&owner=org-name            # filtrar por owner
&repo=repo-name            # filtrar por repositório
&limit=100                 # máximo de registros

# Exemplo:
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/audit/export?format=csv&severity=error&limit=50"
```

## Pricing / Quotas

- Placeholder em `src/lib/pricing.ts`: planos free/pro/enterprise
- Preços por 1k tokens (gpt-4o, gpt-4o-mini, etc.)
- Chat retorna `usage` (tokens) e `costTier`
- **A implementar**: persistência por usuário, billing integration

## Roadmap

- [x] Orquestração multi-agente com waves
- [x] Aprovação obrigatória para risco alto/crítico
- [x] RBAC em endpoints críticos
- [x] Sandbox isolado com políticas configuráveis
- [x] Auditoria estruturada com evidências tipadas
- [x] Export de auditoria (JSON/CSV com filtros)
- [x] Mascaramento de secrets
- [x] Rate limiting
- [x] LegacyAssist (modo guiado)
- [x] Twin Builder (reprodução de incidentes)
- [ ] Persistência de quotas por usuário
- [ ] Dashboard de métricas
- [ ] Integração com billing (Stripe/Vercel)
- [ ] Webhooks para notificações
- [ ] Multi-tenancy

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Dev server (Linux/Mac) |
| `npm run dev:win` | Dev server (Windows, sem Turbopack) |
| `npm run build` | Build de produção |
| `npm run worker` | Inicia worker da fila Redis |
| `npm test` | Roda testes com Vitest (58 testes) |
| `npm run test:watch` | Testes em modo watch |
| `npm run lint` | Lint com ESLint |

## CI/CD

Workflow em `.github/workflows/ci.yml`:
- Lint + type check
- Testes automatizados (58 testes, 11 arquivos)
- Build de produção
- Scan de segurança com Semgrep

## Testes

```bash
# Rodar todos os testes
npm test

# Testes específicos
npm test -- tests/rbac.test.ts
npm test -- tests/audit-export.test.ts
npm test -- tests/orchestrator-sandbox.test.ts

# Coverage dos testes:
# - RBAC: roles, permissions, getUserRole
# - Audit: export, evidências estruturadas, filtros
# - Sandbox: isolation profiles, políticas
# - Pricing: estimativas, planos
# - Rate Limit: sliding window
# - Schemas: validação Zod
# - Playbook DSL: parsing, execução
```

## Notas de Segurança

| Controle | Implementação |
|----------|---------------|
| Autenticação | NextAuth + GitHub OAuth |
| Autorização | RBAC em todos os endpoints críticos |
| Aprovação | Forçada para riskLevel high/critical |
| Sandbox | Docker isolado com --cap-drop=ALL |
| Secrets | Mascaramento automático em logs/SSE |
| Rate Limit | Sliding window por IP/usuário |
| Auditoria | Logs estruturados + evidências tipadas |
| Export | RBAC + rate limit em /api/audit/export |

## Licença

MIT
