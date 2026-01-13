# 🔒 LegacyGuard - Guia de Remediação para Produção

> **Auditoria Consolidada**: Claude Opus 4.5 + GPT 5.2  
> **Data**: 13 de Janeiro de 2026  
> **Status**: ✅ **P0 CONCLUÍDOS** - P1/P2 pendentes

---

## 🎯 Status de Implementação (2026-01-13)

### ✅ P0 - BLOQUEADORES CRÍTICOS (TODOS CONCLUÍDOS)

| ID | Issue | Status | Validação |
|----|-------|--------|-----------|
| **P0-1** | FORCE_DOCKER=true default | ✅ CONCLUÍDO | Build ✓, 351 testes ✓ |
| **P0-2** | Bloquear native fallback em prod | ✅ CONCLUÍDO | Build ✓, 351 testes ✓ |
| **P0-3** | Bloquear ALLOW_NATIVE_EXEC em prod | ✅ CONCLUÍDO | Build ✓, 351 testes ✓ |
| **P0-4** | RBAC no Guardian Flow | ✅ CONCLUÍDO | Build ✓, 351 testes ✓ |

### Arquivos Modificados
- `.env.example` - LEGACYGUARD_FORCE_DOCKER=true
- `.env.local` - LEGACYGUARD_FORCE_DOCKER=true
- `src/lib/sandbox.ts` - Validação de produção + bloqueio native fallback
- `src/agents/orchestrator.ts` - Bloqueio ALLOW_NATIVE_EXEC em produção
- `src/app/api/guardian-flow/route.ts` - RBAC obrigatório
- `tests/orchestrator-sandbox.test.ts` - Novo teste P0-3
- `tests/guardian-flow.test.ts` - Mock RBAC
- `tests/guardian-flow-loa1-execution.test.ts` - Mock RBAC

---

## 📋 Índice

1. [Resumo Executivo](#resumo-executivo)
2. [Diagnóstico Consolidado](#diagnóstico-consolidado)
3. [Arquitetura do Sandbox - Análise Profunda](#arquitetura-do-sandbox---análise-profunda)
4. [Matriz de Remediação P0-P3](#matriz-de-remediação-p0-p3)
5. [Guia de Implementação Detalhado](#guia-de-implementação-detalhado)
6. [Checklist de Validação](#checklist-de-validação)
7. [Configurações de Produção Obrigatórias](#configurações-de-produção-obrigatórias)

---

## Resumo Executivo

### Veredito Final (Consenso Claude + GPT)

**LegacyGuard NÃO está pronto para produção** porque:

1. **Ações críticas não são confinadas ao sandbox** - O Operator executa Git (checkout/commit/push) diretamente no host
2. **Múltiplos caminhos de bypass de isolamento** - `LEGACYGUARD_FORCE_DOCKER=false` e `LEGACYGUARD_ALLOW_NATIVE_EXEC=true`
3. **Endpoints de execução sem RBAC** - Guardian Flow permite execução sem autenticação/autorização
4. **Persistência parcial** - Rollback store e worker status são in-memory

### Modo de Falha Mais Perigoso (Consenso)

> O sistema aparenta "executar com sandbox/isolamento", mas o caminho mais crítico (Operator) altera o repositório real **FORA do sandbox**; isso cria um modo de falha silencioso onde mudanças perigosas podem ser aplicadas/pushadas enquanto o usuário acredita que "rodou no sandbox".

---

## Diagnóstico Consolidado

### ✅ VERIFIED & PRODUCTION-READY

| Componente | Localização | Status |
|------------|-------------|--------|
| Orquestração assíncrona worker/queue | `route.ts` → `agents-consumer.ts` | ✅ Funcional |
| Approval gating (executor/operator) | `orchestrator.ts:248-305` | ✅ Fail-closed |
| Persistência estado Redis | `agents-consumer.ts:73,413` | ✅ Save/restore |
| Docker hardening básico | `sandbox.ts:260-285` | ✅ network=none, cap-drop, no-new-privileges |
| Fail-fast audit em produção | `agents-consumer.ts:566` + `audit.ts:66-93` | ✅ Enforcement |
| CVE-LG-001 (RBAC approvals) | `approvals/[id]/route.ts:36` | ✅ Corrigido |
| CVE-LG-002 (operator gate) | `orchestrator.ts:267` | ✅ Corrigido |
| CVE-LG-003 (decidedBy session) | `approvals/[id]/route.ts:88` | ✅ Corrigido |
| CVE-LG-004 (Redis required) | `approval-store.ts` | ✅ Fail-closed |
| Command validation | `sandbox.ts:680+` | ✅ Bloqueia curl\|bash, rm -rf |
| Secret masking | `secrets.ts` | ✅ Padrões de masking |

### ⚠️ PARTIALLY FUNCTIONAL (RISK OF ILLUSION)

| Componente | Problema | Risco |
|------------|----------|-------|
| **Sandbox como pré-check** | Orchestrator roda sandbox como validação, mas Operator executa Git no host | Ilusão de isolamento |
| **Dois sistemas de aprovação** | Orchestrator (Redis state) vs Guardian Flow (approval-store) não unificados | Bypass por caminho |
| **Anti-replay webhook** | `seenDeliveries = new Map<>()` in-memory, não distribuído | Replay em multi-instância |
| **Audit "imutável"** | Postgres normal, sem hash-chain/append-only | Logs alteráveis |
| **Rollback store** | `Map<string, RollbackRecord>` in-memory | Perde records no restart |
| **Deterministic validation** | Timeout 60s pode causar falso-positivo | Inconsistência |

### 🚨 NOT PRODUCTION-READY (CRITICAL)

| ID | Severidade | Issue | Localização |
|----|------------|-------|-------------|
| **SBX-001** | CRITICAL | Native sandbox fallback sem isolamento | `sandbox.ts:421-480` |
| **SBX-002** | CRITICAL | `LEGACYGUARD_FORCE_DOCKER=false` default | `.env.example:94`, `.env.local:28` |
| **SBX-003** | CRITICAL | `LEGACYGUARD_ALLOW_NATIVE_EXEC=true` bypass | `orchestrator.ts:555-578` |
| **OP-001** | HIGH | Operator executa Git fora do sandbox | `operator.ts:166-187` |
| **GF-001** | HIGH | Guardian Flow sem RBAC | `api/guardian-flow/route.ts:1-120` |
| **CSP-001** | MEDIUM | CSP com `unsafe-inline` e `unsafe-eval` | `next.config.ts:1-25` |
| **MEM-001** | MEDIUM | Rollback store in-memory | `rollback.ts:47` |
| **WH-001** | MEDIUM | Webhook signature bypass em dev | `webhook/route.ts:45-60` |

---

## Arquitetura do Sandbox - Análise Profunda

### 📁 Localização: `src/lib/sandbox.ts` (771 linhas)

### Fluxo de Decisão de Execução

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         runSandbox(config)                                  │
│                              sandbox.ts:493                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │  config.enabled === false?    │
                    └───────────────────────────────┘
                           │ YES              │ NO
                           ▼                  ▼
                    ┌──────────────┐   ┌────────────────────────────┐
                    │ Return OK    │   │ Check Docker availability  │
                    │ (no sandbox) │   │ isDockerAvailable()        │
                    └──────────────┘   └────────────────────────────┘
                                              │
                              ┌───────────────┴───────────────┐
                              │                               │
                         Docker OK                      Docker FAIL
                              │                               │
                              ▼                               ▼
                    ┌──────────────────┐        ┌──────────────────────────┐
                    │ runDockerSandbox │        │ LEGACYGUARD_FORCE_DOCKER │
                    │   (ISOLATED)     │        │        === 'true'?       │
                    │                  │        └──────────────────────────┘
                    │ ✅ network=none  │               │            │
                    │ ✅ cap-drop=ALL  │              YES           NO
                    │ ✅ read-only     │               │            │
                    │ ✅ no-new-privs  │               ▼            ▼
                    │ ✅ gVisor/runsc  │        ┌──────────┐  ┌─────────────────┐
                    └──────────────────┘        │ FAIL     │  │ runNativeSandbox│
                                                │ (safe)   │  │ ⚠️ NO ISOLATION │
                                                └──────────┘  │                 │
                                                              │ ❌ Full host    │
                                                              │ ❌ Network open │
                                                              │ ❌ FS writable  │
                                                              └─────────────────┘
```

### Código Crítico: Native Fallback

**Arquivo**: `sandbox.ts:421-480`

```typescript
// Run sandbox natively (fallback - less secure)
async function runNativeSandbox(config: SandboxConfig): Promise<SandboxResult> {
  const startTime = Date.now();
  const log = config.onLog || console.log;

  const command = config.command || ...;

  log(`[Sandbox/Native] ⚠️ Running without isolation (Docker unavailable)`);
  log(`[Sandbox/Native] Command: ${command}`);

  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'cmd.exe' : '/bin/sh';
    const shellArgs = isWindows ? ['/c', command] : ['-c', command];

    // ⚠️ CRÍTICO: spawn direto no host sem qualquer isolamento
    const proc = spawn(shell, shellArgs, {
      cwd: config.repoPath,  // Acesso ao filesystem real
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: config.timeoutMs || 300000,  // Único "controle": timeout
    });
    // ...
  });
}
```

**Problema**: Quando Docker não está disponível e `LEGACYGUARD_FORCE_DOCKER !== 'true'`, comandos executam diretamente no host com privilégios do processo Node.js.

### Código Crítico: Operator Fora do Sandbox

**Arquivo**: `operator.ts:166-187`

```typescript
// Executar operações Git
await git.checkoutLocalBranch(branch);   // ❌ HOST DIRETO

// Aplicar patch se fornecido como arquivo
if (task.patchFile && fs.existsSync(task.patchFile)) {
  await git.raw(['apply', task.patchFile]);  // ❌ HOST DIRETO
}

await git.add('.');  // ❌ HOST DIRETO

// Obter arquivos alterados
const status = await git.status();
const filesChanged = [...status.modified, ...status.created, ...status.deleted];

await git.commit(commitMessage);  // ❌ HOST DIRETO

// Push se solicitado
if (task.push !== false) {
  try {
    await git.push('origin', branch, ['--set-upstream']);  // ❌ HOST DIRETO + NETWORK
    pushed = true;
  } catch (err: any) {
    // ...
  }
}
```

**Problema**: Operator usa `simple-git` para executar operações Git diretamente no sistema de arquivos do host. O sandbox só valida comandos de teste **antes** dessas operações - não as contém.

### Código Crítico: Bypass Explícito

**Arquivo**: `orchestrator.ts:555-578`

```typescript
// Verificar se bypass explícito está configurado
const allowNativeExec = process.env.LEGACYGUARD_ALLOW_NATIVE_EXEC === 'true';

if (!sandbox?.enabled && requiresSandbox) {
  if (allowNativeExec) {
    this.log(`⚠️ AVISO: Sandbox desabilitado para ${task.agent} mas LEGACYGUARD_ALLOW_NATIVE_EXEC=true`);
    this.log('⚠️ Execução prosseguirá SEM ISOLAMENTO - NÃO USE EM PRODUÇÃO');
    
    // Apenas loga - NÃO BLOQUEIA
    await logEvent({
      action: 'sandbox.bypassed',
      severity: 'warn',  // ⚠️ Deveria ser 'error' ou blocking
      message: `Sandbox bypassado para task ${task.id} (${task.agent})`,
      // ...
    });
    
    return null;  // Permite execução sem sandbox
  }
  throw new Error(`Sandbox obrigatório...`);  // Só bloqueia se flag não estiver setada
}
```

---

## Matriz de Remediação P0-P3

### P0 - BLOQUEADORES (Fazer ANTES de qualquer deploy)

| ID | Issue | Ação | Esforço | Arquivo | Status |
|----|-------|------|---------|---------|--------|
| **P0-1** | Default inseguro | `LEGACYGUARD_FORCE_DOCKER=true` em todos os ambientes | 5 min | `.env.*`, `sandbox.ts` | ✅ **CONCLUÍDO** (2026-01-13) |
| **P0-2** | Native fallback | Bloquear `runNativeSandbox()` em produção (fail-closed) | 2h | `sandbox.ts` | ✅ **CONCLUÍDO** (2026-01-13) |
| **P0-3** | Bypass flag | Bloquear `LEGACYGUARD_ALLOW_NATIVE_EXEC` em produção | 30min | `orchestrator.ts` | ✅ **CONCLUÍDO** (2026-01-13) |
| **P0-4** | Guardian Flow RBAC | Adicionar `requirePermission('execute')` | 1h | `guardian-flow/route.ts` | ✅ **CONCLUÍDO** (2026-01-13) |

### P1 - CRÍTICOS (Primeira sprint)

| ID | Issue | Ação | Esforço | Arquivo |
|----|-------|------|---------|---------|
| **P1-1** | Operator no host | Mover operações Git para dentro do container | 8h | `operator.ts` |
| **P1-2** | Rollback in-memory | Persistir em Redis/PostgreSQL | 4h | `rollback.ts` |
| **P1-3** | Anti-replay distribuído | Mover para Redis com TTL | 2h | `webhook/route.ts` |
| **P1-4** | CSP inseguro | Remover `unsafe-inline`, `unsafe-eval` | 4h | `next.config.ts` |

### P2 - IMPORTANTES (Segunda sprint)

| ID | Issue | Ação | Esforço | Arquivo |
|----|-------|------|---------|---------|
| **P2-1** | Unificar approval systems | Single source of truth para aprovações | 8h | `approval-store.ts`, `orchestrator.ts` |
| **P2-2** | Worker status persistente | Mover para Redis | 2h | `api/worker/status/route.ts` |
| **P2-3** | Audit hash-chain | Implementar append-only com hash | 8h | `audit.ts` |
| **P2-4** | Webhook signature dev | Remover bypass em não-produção | 1h | `webhook/route.ts` |

### P3 - MELHORIAS (Backlog)

| ID | Issue | Ação | Esforço | Arquivo |
|----|-------|------|---------|---------|
| **P3-1** | Pricing tracker | Persistir billing data | 4h | `pricing.ts` |
| **P3-2** | Logs sources | Mover para PostgreSQL | 2h | `api/logs/sources/route.ts` |
| **P3-3** | Deterministic timeout | Configurar timeout dinâmico | 2h | `SafetyGates.ts` |

---

## Guia de Implementação Detalhado

### P0-1: Forçar Docker como Default

**Arquivos a modificar:**
- `.env.example`
- `.env.local`
- `render.yaml` (se usando Render)
- Documentação

```diff
# .env.example
- LEGACYGUARD_FORCE_DOCKER=false
+ LEGACYGUARD_FORCE_DOCKER=true
+ # CRÍTICO: Nunca definir como false em produção
```

**Validação em runtime** - Adicionar em `sandbox.ts`:

```typescript
// No início do arquivo
if (process.env.NODE_ENV === 'production' && process.env.LEGACYGUARD_FORCE_DOCKER !== 'true') {
  throw new Error(
    'FATAL: LEGACYGUARD_FORCE_DOCKER must be "true" in production. ' +
    'Native execution is not allowed for security reasons.'
  );
}
```

---

### P0-2: Remover/Bloquear Native Fallback

**Opção A: Fail-closed (Recomendado)**

```typescript
// sandbox.ts - Substituir runNativeSandbox por:

async function runNativeSandbox(config: SandboxConfig): Promise<SandboxResult> {
  // NUNCA executar nativamente em produção
  if (process.env.NODE_ENV === 'production') {
    await logEvent({
      action: 'sandbox.blocked',
      severity: 'error',
      message: 'Native sandbox execution blocked in production',
      metadata: { repoPath: config.repoPath },
    });
    
    return {
      success: false,
      exitCode: 1,
      stdout: '',
      stderr: 'BLOCKED: Native execution is not allowed in production. Docker is required.',
      durationMs: 0,
      method: 'native',
      error: 'Native execution blocked for security',
    };
  }
  
  // Permitir apenas em development com warning severo
  console.warn('⚠️ WARNING: Running without Docker isolation. This is ONLY acceptable in local development.');
  // ... código original ...
}
```

**Opção B: Remoção total**

```typescript
// sandbox.ts linha ~560
} else {
  // ANTES:
  // log('[Sandbox] Docker indisponível; usando fallback nativo com timeout');
  // execute = () => runNativeSandbox(config);
  
  // DEPOIS:
  const message = 'FATAL: Docker is required for sandbox execution. Native fallback is disabled.';
  log(`[Sandbox] ${message}`);
  return {
    success: false,
    exitCode: 1,
    stdout: '',
    stderr: message,
    durationMs: 0,
    method: 'native',
    error: message,
  };
}
```

---

### P0-3: Bloquear Bypass em Produção

**Arquivo**: `orchestrator.ts:555`

```typescript
// ANTES
const allowNativeExec = process.env.LEGACYGUARD_ALLOW_NATIVE_EXEC === 'true';

// DEPOIS
const allowNativeExec = process.env.LEGACYGUARD_ALLOW_NATIVE_EXEC === 'true';

// BLOQUEAR EM PRODUÇÃO
if (allowNativeExec && process.env.NODE_ENV === 'production') {
  const errorMsg = 'FATAL: LEGACYGUARD_ALLOW_NATIVE_EXEC=true is NOT ALLOWED in production';
  this.log(`❌ ${errorMsg}`);
  
  await logEvent({
    action: 'security.violation',
    severity: 'error',
    message: errorMsg,
    metadata: { taskId: task.id, agent: task.agent },
  });
  
  throw new Error(errorMsg);
}
```

---

### P0-4: RBAC no Guardian Flow

**Arquivo**: `src/app/api/guardian-flow/route.ts`

```typescript
// Adicionar no início do arquivo
import { requirePermission } from '@/lib/rbac';

// Modificar POST handler
export async function POST(request: NextRequest) {
  // ✅ ADICIONAR: RBAC check obrigatório
  const authResult = await requirePermission('execute');
  if (!authResult.authorized) {
    return authResult.response;
  }
  
  const startTime = Date.now();
  const flowId = `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // ... resto do código ...
}
```

---

### P1-1: Operator em Container

**Arquitetura proposta:**

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ANTES (Vulnerável)                           │
├─────────────────────────────────────────────────────────────────────┤
│  Orchestrator                                                       │
│      │                                                              │
│      ├── runSandbox() ──► Docker Container (testes apenas)          │
│      │                                                              │
│      └── runOperator() ──► HOST DIRETO (git checkout/commit/push)   │
│                            ⚠️ SEM ISOLAMENTO                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        DEPOIS (Seguro)                              │
├─────────────────────────────────────────────────────────────────────┤
│  Orchestrator                                                       │
│      │                                                              │
│      └── runSandboxWithOperator() ──► Docker Container              │
│                                           │                         │
│                                           ├── /workspace (bind)     │
│                                           ├── git operations        │
│                                           ├── network=bridge (git)  │
│                                           └── SSH key via secret    │
│                                                                     │
│          ✅ Isolado   ✅ Auditável   ✅ Limitado                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Implementação conceitual:**

```typescript
// operator.ts - Nova função
export async function runOperatorInSandbox(task: OperatorInput): Promise<OperatorOutput> {
  const repoPath = task.repoPath || process.cwd();
  
  // Executar git operations dentro do container
  const result = await runSandbox({
    enabled: true,
    repoPath,
    useDocker: true,
    // Permitir rede para git push (mas restringir)
    networkPolicy: 'bridge',
    // Workspace precisa ser writable para git
    fsPolicy: 'readwrite',
    // Snapshot antes de modificações
    snapshotOnFail: true,
    // Comandos git
    commands: [
      `git checkout -b ${task.branchName}`,
      task.patchFile ? `git apply ${task.patchFile}` : 'echo "no patch"',
      `git add .`,
      `git commit -m "${task.prTitle}"`,
      task.push !== false ? `git push origin ${task.branchName} --set-upstream` : 'echo "no push"',
    ],
    // Montar SSH key como secret
    env: {
      GIT_SSH_COMMAND: 'ssh -i /run/secrets/deploy_key -o StrictHostKeyChecking=no',
    },
  });
  
  // ... processar resultado ...
}
```

---

### P1-4: CSP Seguro

**Arquivo**: `next.config.ts`

```typescript
const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // ANTES: "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // DEPOIS: Usar nonces para scripts inline necessários
              "script-src 'self'",
              // ANTES: "style-src 'self' 'unsafe-inline'",
              // DEPOIS: Extrair CSS para arquivos
              "style-src 'self'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://api.openai.com https://api.github.com https://*.github.com https://*.neon.tech",
              "frame-ancestors 'self'",
              // ADICIONAR:
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
          },
          // ADICIONAR headers de segurança
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};
```

---

## Checklist de Validação

### Antes do Deploy

- [ ] `LEGACYGUARD_FORCE_DOCKER=true` em todas as configs
- [ ] `LEGACYGUARD_ALLOW_NATIVE_EXEC` removido ou bloqueado
- [ ] Docker disponível e funcionando no ambiente
- [ ] gVisor/runsc instalado (recomendado)
- [ ] Redis configurado e conectável
- [ ] PostgreSQL (AUDIT_DB_URL) configurado
- [ ] GITHUB_WEBHOOK_SECRET configurado
- [ ] RBAC em todos os endpoints de execução

### Testes de Segurança

```bash
# 1. Verificar que native fallback é bloqueado
LEGACYGUARD_FORCE_DOCKER=false NODE_ENV=production pnpm test sandbox-fallback

# 2. Verificar RBAC no Guardian Flow
curl -X POST http://localhost:3000/api/guardian-flow \
  -H "Content-Type: application/json" \
  -d '{"intent": "test"}' 
# Deve retornar 401/403

# 3. Verificar Docker isolation
docker run --rm legacyguard-sandbox:latest \
  sh -c "curl http://169.254.169.254/latest/meta-data/" 
# Deve falhar (network=none)

# 4. Verificar audit fail-fast
AUDIT_DB_URL="" NODE_ENV=production pnpm start
# Deve falhar no startup
```

### Monitoramento em Produção

```sql
-- Verificar bypass attempts
SELECT * FROM audit_logs 
WHERE action IN ('sandbox.bypassed', 'security.violation')
ORDER BY created_at DESC
LIMIT 100;

-- Verificar métodos de execução
SELECT 
  metadata->>'method' as method,
  COUNT(*) as count
FROM audit_logs 
WHERE action = 'sandbox.executed'
GROUP BY method;
-- 'docker' deve ser 100%, 'native' deve ser 0%
```

---

## Configurações de Produção Obrigatórias

### Variáveis de Ambiente

```bash
# OBRIGATÓRIAS
NODE_ENV=production
LEGACYGUARD_FORCE_DOCKER=true
REDIS_URL=redis://...
AUDIT_DB_URL=postgresql://...
GITHUB_WEBHOOK_SECRET=<secret>
NEXTAUTH_SECRET=<secret>

# PROIBIDAS EM PRODUÇÃO
# LEGACYGUARD_ALLOW_NATIVE_EXEC=true  ❌ NUNCA
# LEGACYGUARD_FORCE_DOCKER=false      ❌ NUNCA

# RECOMENDADAS
LEGACYGUARD_SANDBOX_RUNTIME=runsc  # gVisor para máximo isolamento
LEGACYGUARD_SANDBOX_MEMORY=1g
LEGACYGUARD_SANDBOX_CPU=1
```

### Dockerfile de Produção

```dockerfile
FROM node:20-slim

# Instalar Docker CLI para sandbox
RUN apt-get update && apt-get install -y docker.io && rm -rf /var/lib/apt/lists/*

# Verificação de segurança no startup
ENV LEGACYGUARD_FORCE_DOCKER=true
ENV NODE_ENV=production

# Health check que valida Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD docker info > /dev/null 2>&1 || exit 1

# ...
```

---

## Apêndice: Comparação de Auditorias

| Aspecto | Claude Opus 4.5 | GPT 5.2 | Consenso |
|---------|-----------------|---------|----------|
| Native fallback | CRITICAL | - | CRITICAL |
| FORCE_DOCKER default | CRITICAL | - | CRITICAL |
| ALLOW_NATIVE_EXEC bypass | - | HIGH | HIGH (P0) |
| Operator fora do sandbox | - | HIGH | HIGH (P1) |
| Guardian Flow sem RBAC | - | HIGH | HIGH (P0) |
| Rollback in-memory | HIGH | - | HIGH (P1) |
| CSP inseguro | - | MEDIUM | MEDIUM (P1) |
| Anti-replay in-memory | - | MEDIUM | MEDIUM (P1) |
| Dual approval systems | - | MEDIUM | MEDIUM (P2) |

---

**Documento gerado em**: 13 de Janeiro de 2026  
**Auditores**: Claude Opus 4.5 + GPT 5.2  
**Próxima revisão**: Após implementação de todos os itens P0
