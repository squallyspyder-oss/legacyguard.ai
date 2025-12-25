# 🛡️ LegacyGuard - Guia para v0 by Vercel

> **Este documento orienta o agente v0 da Vercel sobre como construir, estender e configurar o LegacyGuard corretamente.**

---

## 📋 Visão Geral do Projeto

**LegacyGuard** é uma plataforma Next.js/TypeScript de orquestração de agentes AI para manutenção segura de código legado. O sistema coordena múltiplos agentes especializados (análise, refatoração, revisão, execução) com foco em segurança, auditoria e controle humano.

### Stack Tecnológica

| Categoria | Tecnologia | Versão |
|-----------|------------|--------|
| Framework | Next.js | 16.x |
| Runtime | Node.js | 22.x |
| Linguagem | TypeScript | 5.x |
| UI | React | 18.2 |
| Styling | TailwindCSS | 4.x |
| Auth | NextAuth.js | 4.x |
| AI/LLM | OpenAI SDK | 6.x |
| Database | PostgreSQL + pgvector | - |
| Cache/Queue | Redis (ioredis) | - |
| Validação | Zod | 4.x |
| Testes | Vitest | 4.x |

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                        LegacyGuard UI                           │
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

---

## 🤖 Sistema de Agentes

O LegacyGuard utiliza múltiplos agentes especializados. **Cada agente tem responsabilidades específicas:**

### Agentes Disponíveis

| Agente | Arquivo | Responsabilidade |
|--------|---------|------------------|
| **Orchestrator** | `src/agents/orchestrator.ts` | Coordena todos os agentes, gerencia waves de execução, controla aprovações |
| **Planner** | `src/agents/planner.ts` | Cria planos de execução, divide tarefas, estima riscos |
| **Advisor** | `src/agents/advisor.ts` | Analisa código, identifica riscos, sugere melhorias |
| **Operator** | `src/agents/operator.ts` | Executa operações de código (refatoração, patches) |
| **Executor** | `src/agents/executor.ts` | Executa comandos em sandbox seguro |
| **Reviewer** | `src/agents/reviewer.ts` | Revisa alterações antes de aplicar, valida segurança |
| **Twin Builder** | `src/agents/twin-builder.ts` | Reproduz incidentes em ambiente controlado |
| **Chat** | `src/agents/chat.ts` | Modo conversacional LegacyAssist |

### Fluxo de Execução

```
User Request
     │
     ▼
┌─────────────┐
│   Planner   │ → Cria plano com subtarefas
└─────────────┘
     │
     ▼
┌─────────────┐
│Twin Builder │ → (opcional) Reproduz incidente
└─────────────┘
     │
     ▼
┌─────────────┐
│   Advisor   │ → Analisa riscos e contexto
└─────────────┘
     │
     ▼
┌─────────────┐
│  Operator   │ → Gera patches/refatorações
└─────────────┘
     │
     ▼
┌─────────────┐
│  Reviewer   │ → Valida antes de executar
└─────────────┘
     │
     ▼ (se aprovado)
┌─────────────┐
│  Executor   │ → Executa em sandbox
└─────────────┘
```

---

## 🔧 Serviços Externos Necessários

### ⚠️ OBRIGATÓRIOS para Funcionamento Completo

#### 1. OpenAI API
- **Para que serve:** Todos os agentes de IA (análise, geração de código, revisão)
- **Como obter:** https://platform.openai.com/api-keys
- **Variável:** `OPENAI_API_KEY`
- **Modelos usados:**
  - `gpt-4o-mini` (chat rápido, `OPENAI_CHEAP_MODEL`)
  - `gpt-4o` (análise profunda, `OPENAI_DEEP_MODEL`)

#### 2. PostgreSQL com pgvector
- **Para que serve:** Auditoria, logs estruturados, busca semântica RAG
- **Opções de provisionamento:**
  - [Supabase](https://supabase.com) (gratuito até 500MB)
  - [Neon](https://neon.tech) (gratuito até 3GB)
  - [Railway](https://railway.app)
- **Variáveis:** `PGVECTOR_URL` ou `AUDIT_DB_URL`
- **Setup inicial:** Execute `scripts/pgvector_bootstrap.sql`

#### 3. Redis
- **Para que serve:** Fila de tarefas, rate limiting, streams SSE
- **Opções de provisionamento:**
  - [Upstash](https://upstash.com) (gratuito até 10K comandos/dia)
  - [Redis Cloud](https://redis.com/try-free/)
  - [Railway](https://railway.app)
- **Variável:** `REDIS_URL`

### 📌 OPCIONAIS (mas recomendados)

#### 4. GitHub OAuth
- **Para que serve:** Login de usuários, acesso a repositórios privados
- **Como obter:** GitHub Settings → Developer Settings → OAuth Apps
- **Variáveis:** `GITHUB_ID`, `GITHUB_SECRET`

#### 5. Docker (para Sandbox)
- **Para que serve:** Execução isolada de código em container
- **Requerido para:** Executor agent, Twin Builder
- **Variável:** `LEGACYGUARD_SANDBOX_ENABLED=true`

---

## 📁 Estrutura de Diretórios

```
legacyguard/
├── src/
│   ├── agents/              # 🤖 Agentes de IA
│   │   ├── orchestrator.ts  # Coordenador principal
│   │   ├── planner.ts       # Planejamento de tarefas
│   │   ├── advisor.ts       # Análise e recomendações
│   │   ├── operator.ts      # Operações de código
│   │   ├── executor.ts      # Execução em sandbox
│   │   ├── reviewer.ts      # Revisão de segurança
│   │   ├── twin-builder.ts  # Reprodução de incidentes
│   │   └── chat.ts          # Chat conversacional
│   │
│   ├── analyzers/           # 🔍 Analisadores de código
│   │   ├── behavior-classifier.ts
│   │   ├── harness-generator.ts
│   │   └── legacy-profiler.ts
│   │
│   ├── app/                 # 📱 Next.js App Router
│   │   ├── page.tsx         # Página principal
│   │   ├── layout.tsx       # Layout global
│   │   ├── globals.css      # Estilos globais
│   │   ├── Providers.tsx    # Context providers
│   │   └── api/             # API Routes
│   │       ├── agents/      # Endpoints de agentes
│   │       ├── chat/        # Chat API
│   │       ├── audit/       # Auditoria
│   │       ├── incidents/   # Ingestão de incidentes
│   │       └── auth/        # NextAuth
│   │
│   ├── components/          # 🎨 Componentes React
│   │   ├── ChatInterface.tsx    # Interface principal
│   │   ├── AgentSelector.tsx    # Seletor de agentes
│   │   └── SettingsSidebar.tsx  # Configurações
│   │
│   ├── lib/                 # 📚 Bibliotecas utilitárias
│   │   ├── audit.ts         # Sistema de auditoria
│   │   ├── sandbox.ts       # Execução em container
│   │   ├── indexer.ts       # Indexação de código
│   │   ├── indexer-pgvector.ts  # RAG com pgvector
│   │   ├── rbac.ts          # Controle de acesso
│   │   ├── rate-limit.ts    # Rate limiting
│   │   ├── quotas.ts        # Quotas de uso
│   │   ├── pricing.ts       # Precificação de tokens
│   │   ├── secrets.ts       # Mascaramento de secrets
│   │   ├── queue.ts         # Fila Redis
│   │   ├── metrics.ts       # Métricas MTTR
│   │   ├── impact.ts        # Análise de impacto
│   │   └── playbook-dsl.ts  # DSL de playbooks
│   │
│   ├── types/               # 📝 Tipos TypeScript
│   └── worker/              # ⚙️ Worker background
│       └── agents-consumer.ts
│
├── scripts/                 # 🔧 Scripts utilitários
│   ├── agentWorker.ts       # Worker principal
│   ├── runner_sandbox.sh    # Runner de sandbox
│   ├── pgvector_bootstrap.sql
│   └── audit_schema.sql
│
├── tests/                   # 🧪 Testes
├── public/                  # Assets estáticos
└── [config files]           # Configurações
```

---

## 🎨 Guia de UI/UX

### Componente Principal: ChatInterface

O `ChatInterface.tsx` é o componente central com **1300+ linhas**. Principais features:

#### Estados de Configuração
```typescript
// Sandbox e segurança
sandboxEnabled: boolean      // Habilita execução em container
sandboxMode: 'fail' | 'warn' // Comportamento em falha
safeMode: boolean            // Bloqueia ações destrutivas
reviewGate: boolean          // Requer aprovação para executar

// LegacyAssist (modo guiado)
assistMetrics: {
  stepsCompleted: number,
  researches: number,
  executionBlocked: boolean
}

// Limites
billingCap: number           // Limite de custo USD
tokenCap: number             // Limite de tokens
temperatureCap: number       // Temperatura do LLM
```

#### Tipos de Mensagem
```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string;
  patches?: Patch[];           // Patches de código sugeridos
  tests?: TestFile[];          // Testes gerados
  approvalRequired?: string;   // ID de orquestração pendente
  suggestOrchestrateText?: string;
  twinOffer?: { prompt: string };
  twinReady?: boolean;
}
```

### Design System

- **Framework:** TailwindCSS 4.x
- **Tema:** Dark mode por padrão
- **Cores principais:**
  - Background: `bg-zinc-900`, `bg-zinc-800`
  - Texto: `text-zinc-100`, `text-zinc-400`
  - Accent: `bg-blue-600`, `bg-green-600`
  - Danger: `bg-red-600`, `bg-orange-500`
- **Ícones:** Usar emojis inline (🛡️, 🤖, ⚠️, ✅, etc.)

### Padrões de Componentes

```tsx
// Botão primário
<button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
  Ação
</button>

// Card de configuração
<div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
  <h3 className="text-sm font-medium text-zinc-300">Título</h3>
  <p className="text-xs text-zinc-500">Descrição</p>
</div>

// Badge de risco
<span className={`px-2 py-1 rounded text-xs ${
  risk === 'critical' ? 'bg-red-600' :
  risk === 'high' ? 'bg-orange-500' :
  risk === 'medium' ? 'bg-yellow-500' :
  'bg-green-600'
} text-white`}>
  {risk}
</span>
```

---

## 🔐 Sistema de Segurança

### RBAC (Role-Based Access Control)

```typescript
// Roles disponíveis (src/lib/rbac.ts)
type Role = 'viewer' | 'developer' | 'admin' | 'system';

// Permissões por role
const ROLE_PERMISSIONS = {
  viewer: ['read', 'chat'],
  developer: ['read', 'chat', 'execute', 'approve'],
  admin: ['read', 'chat', 'execute', 'approve', 'admin'],
  system: ['*']
};
```

### Rate Limiting

```typescript
// Limites padrão (src/lib/rate-limit.ts)
const RATE_LIMITS = {
  chat: { requests: 60, window: '1m' },
  agents: { requests: 20, window: '1m' },
  execute: { requests: 5, window: '1m' }
};
```

### Mascaramento de Secrets

O sistema automaticamente mascara:
- API keys (`sk-...`, `key-...`)
- Tokens de acesso
- Senhas em strings
- Connection strings

---

## 📊 Funcionalidades Chave

### 1. LegacyAssist (Modo Guiado)

Roteiro step-by-step que:
- Sugere próximas ações
- Oferece pesquisas (RAG, Web, Brainstorm)
- Bloqueia execução até validação
- Rastreia progresso

### 2. Twin Builder (Reprodução de Incidentes)

```typescript
// Entrada de incidente
interface IncidentAlert {
  source: 'sentry' | 'datadog' | 'otel' | 'manual';
  message: string;
  stackTrace?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// Saída
interface TwinBuilderResult {
  twinId: string;
  status: 'ready' | 'partial' | 'failed';
  harness?: { commands: Command[] };
  syntheticTests?: TestCase[];
  impactGuardrails?: { warnings: string[] };
}
```

### 3. Sandbox Isolado

Execução em container Docker com:
- Políticas de rede (none/bridge)
- Políticas de filesystem (readonly/readwrite)
- Limites de recursos (CPU/memória)
- Timeout configurável

### 4. Auditoria Estruturada

Todas as ações são logadas com:
- Timestamp
- Usuário/role
- Agente responsável
- Input/output
- Evidências (diffs, comandos, findings)
- Assinatura HMAC

---

## ⚙️ Variáveis de Ambiente Completas

```env
# ============================================
# OBRIGATÓRIAS
# ============================================
OPENAI_API_KEY=sk-...                    # Chave da API OpenAI
NEXTAUTH_SECRET=...                      # Secret para NextAuth (gere com: openssl rand -base64 32)
NEXTAUTH_URL=https://seu-app.vercel.app  # URL da aplicação

# ============================================
# BANCO DE DADOS
# ============================================
PGVECTOR_URL=postgresql://...            # PostgreSQL com pgvector
AUDIT_DB_URL=postgresql://...            # Alternativa para auditoria separada

# ============================================
# REDIS
# ============================================
REDIS_URL=redis://...                    # Redis para filas e rate limiting

# ============================================
# AUTENTICAÇÃO GITHUB
# ============================================
GITHUB_ID=...                            # GitHub OAuth App ID
GITHUB_SECRET=...                        # GitHub OAuth App Secret

# ============================================
# MODELOS OPENAI
# ============================================
OPENAI_CHEAP_MODEL=gpt-4o-mini           # Modelo para chat rápido
OPENAI_DEEP_MODEL=gpt-4o                 # Modelo para análise profunda

# ============================================
# SANDBOX
# ============================================
LEGACYGUARD_SANDBOX_ENABLED=true         # Habilitar sandbox
LEGACYGUARD_SANDBOX_REPO_PATH=/workspace # Path do repositório no container
LEGACYGUARD_SANDBOX_COMMAND=npm test     # Comando padrão
LEGACYGUARD_SANDBOX_TIMEOUT_MS=900000    # Timeout (15 min)
LEGACYGUARD_SANDBOX_FAIL_MODE=fail       # fail|warn
LEGACYGUARD_FORCE_DOCKER=false           # Forçar Docker mesmo sem WSL

# ============================================
# QUOTAS E LIMITES
# ============================================
QUOTA_CIRCUIT_THRESHOLD_USD=1000         # Limite de custo para circuit breaker
QUOTA_CIRCUIT_PAUSE_MS=600000            # Pausa quando limite atingido
MAX_TOKENS_PER_REQUEST=50000             # Tokens máximos por request

# ============================================
# AUDITORIA
# ============================================
AUDIT_SIGNING_KEY=...                    # Chave para assinatura HMAC de logs
```

---

## 🚀 Deploy na Vercel

### Passo a Passo

1. **Conecte o repositório** no dashboard da Vercel

2. **Configure as variáveis de ambiente:**
   - Vá em Settings → Environment Variables
   - Adicione todas as variáveis obrigatórias

3. **Configure o build:**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`

4. **Deploy!**

### Limitações da Vercel

⚠️ **O Worker NÃO roda na Vercel!**

O worker (`npm run worker`) é um processo long-running que:
- Consome fila do Redis
- Executa orquestrações em background
- Roda sandbox Docker

**Soluções para o Worker:**
1. **Render** - Usar `Dockerfile.worker`
2. **Fly.io** - Deploy como container
3. **Railway** - Docker service
4. **Cloud Run** - GCP serverless container

---

## 🧪 Testes

```bash
# Rodar todos os testes
npm test

# Testes específicos
npm test -- -i tests/orchestrator-sandbox.test.ts

# Watch mode
npm run test:watch
```

### Estrutura de Testes

```
tests/
├── analyzers.test.ts          # Analisadores de código
├── audit-export.test.ts       # Export de auditoria
├── chat.test.ts               # Agente de chat
├── metrics.test.ts            # Métricas MTTR
├── orchestrator-sandbox.test.ts  # Orquestrador + sandbox
├── playbook-dsl.test.ts       # DSL de playbooks
├── pricing.test.ts            # Precificação
├── quotas.test.ts             # Sistema de quotas
├── rate-limit.test.ts         # Rate limiting
├── rbac.test.ts               # Controle de acesso
├── schemas.test.ts            # Validação Zod
└── secrets.test.ts            # Mascaramento de secrets
```

---

## 📝 Convenções de Código

### TypeScript
- Strict mode habilitado
- Tipos explícitos para exports públicos
- Interfaces para objetos complexos
- Zod para validação runtime

### Nomenclatura
- Arquivos: `kebab-case.ts`
- Componentes: `PascalCase.tsx`
- Funções: `camelCase`
- Constantes: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

### Imports
```typescript
// Ordem de imports
import { external } from 'external-package';      // 1. Externos
import { internal } from '@/lib/internal';        // 2. Internos (alias @/)
import { local } from './local';                  // 3. Locais
import type { Type } from './types';              // 4. Types (separados)
```

---

## 🆘 Troubleshooting

### Erro: "OPENAI_API_KEY not set"
→ Configure a variável de ambiente no Vercel ou `.env`

### Erro: "pgvector search failed"
→ Verifique se a extensão pgvector está habilitada no PostgreSQL

### Erro: "Redis connection refused"
→ Verifique a URL do Redis e se o serviço está acessível

### Erro: "Sandbox requires WSL/Docker"
→ O sandbox só funciona com Docker. Configure `LEGACYGUARD_SANDBOX_ENABLED=false` para desabilitar

### Build falha com "NEXTAUTH_SECRET"
→ Defina um valor dummy para build: `NEXTAUTH_SECRET=build-time-secret`

---

## 📚 Referências

- [README.md](./README.md) - Documentação principal
- [README.deploy.md](./README.deploy.md) - Guia de deploy detalhado
- [TODO.md](./TODO.md) - Roadmap e planos futuros
- [.env.example](./.env.example) - Template de variáveis

---

> **v0:** Ao criar ou modificar componentes, sempre mantenha a consistência com o design system existente (TailwindCSS dark mode), use os tipos TypeScript definidos, e preserve os padrões de segurança (RBAC, rate limiting, mascaramento).
