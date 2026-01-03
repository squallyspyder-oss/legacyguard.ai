# 🔍 AUDIT.md - Auditoria de Realidade do LegacyGuard

**Data:** 2026-01-03  
**Auditor:** Sistema de Verificação Contínua  
**Versão:** 1.4

---

## ⚠️ RESUMO EXECUTIVO

| Claim | Status | Gravidade |
|-------|--------|-----------||
| Multi-agent orchestration | 🟢 FUNCIONAL | BAIXA |
| Human-in-the-loop approval | 🟢 FUNCIONAL | BAIXA |
| Sandbox execution | 🟢 FUNCIONAL | BAIXA |
| Incident Twin Builder | 🟢 FUNCIONAL | BAIXA |
| Auditoria estruturada | 🟢 FUNCIONAL | BAIXA |
| RAG/pgvector | 🟢 FUNCIONAL | BAIXA |
| RBAC | 🟢 FUNCIONAL | BAIXA |

**Veredicto:** Sistema operacional. Correções P1+P2 aplicadas em 2026-01-03:
- ✅ Worker processa orquestração
- ✅ Estado persistido no Redis  
- ✅ Aprovação auditada
- ✅ RAG status verificado em tempo real
- ✅ Pub/Sub para eventos cross-worker
- ✅ `restoreFromState()` para retomar após aprovação
- ✅ API de status para polling fallback
- ✅ Sandbox obrigatório para executor/operator
- ✅ Falha sem Docker (sem fallback silencioso)
- ✅ Bypass auditado via `LEGACYGUARD_ALLOW_NATIVE_EXEC`
- ✅ **Lock distribuído para aprovação** (Redis SET NX EX)
- ✅ **Auditoria persistente obrigatória em produção**
- ✅ **Actor obrigatório para aprovações**
- ✅ **Indexação automática via webhook GitHub**
- ✅ **Graceful shutdown no worker**

**Gaps restantes:** Nenhum P1/P2. Somente P3 (melhorias futuras).

---

## 1. MULTI-AGENT ORCHESTRATION

### Claim
> "Orquestrador Multi-Agente — Planner cria planos, waves executam em paralelo, aprovação humana obrigatória para ações de risco"

### Realidade

#### ✅ O QUE FUNCIONA
- `Orchestrator` class existe e coordena agentes
- `Planner` gera planos estruturados com waves
- Waves executam em paralelo via `Promise.all`
- Agentes (advisor, reviewer, operator, executor) estão implementados
- Logs são emitidos durante execução
- **[CORRIGIDO]** Worker consumer agora processa `role: 'orchestrate'`
- **[CORRIGIDO]** Estado de orquestração é persistido no Redis
- **[CORRIGIDO]** `Orchestrator.restoreFromState()` implementado
- **[CORRIGIDO]** Pub/Sub para eventos cross-worker em tempo real
- **[CORRIGIDO]** Aprovação retoma execução automaticamente

#### ⚠️ LIMITACÕES RESTANTES
1. ~~**Restauração de Estado Parcial**~~ ✅ CORRIGIDO
   - ~~Estado é salvo mas `resumeAfterApproval` precisa ser refatorado~~
   - ~~Orchestrator precisa aceitar estado externo para restauração completa~~
   
2. ~~**Sem Graceful Shutdown**~~ ✅ CORRIGIDO
   - ~~Worker não tem shutdown gracioso~~
   - ~~Tarefas em execução podem ser perdidas em restart~~
   - **Agora: SIGTERM/SIGINT aguardam jobs ativos (max 30s)**

### Status: 🟢 FUNCIONAL
### Ação Requerida: NENHUMA
- ~~Refatorar Orchestrator para aceitar estado externo~~ ✅ FEITO
- ~~Implementar graceful shutdown no worker~~ ✅ FEITO

---

## 2. HUMAN-IN-THE-LOOP APPROVAL

### Claim
> "Aprovação humana obrigatória para ações de risco"
> "Planner força requiresApproval: true para riskLevel: high | critical"

### Realidade

#### ✅ O QUE FUNCIONA
- `requiresApproval` flag existe no Plan
- Orchestrator verifica flag antes de executar waves com `executor`
- Método `grantApproval()` existe
- Risco alto/crítico força `requiresApproval = true` (linha 178-180)
- **[CORRIGIDO]** Worker processa `role: 'approve'`
- **[CORRIGIDO]** Aprovação é registrada como evidência auditável
- **[CORRIGIDO]** Estado é persistido no Redis para retomada
- **[CORRIGIDO]** `restoreFromState()` restaura Orchestrator de estado salvo
- **[CORRIGIDO]** `resumeAfterApproval()` retoma execução das waves restantes
- **[CORRIGIDO]** Pub/Sub notifica clientes em tempo real sobre aprovação

#### ⚠️ LIMITAÇÕES RESTANTES

1. ~~**Resume Após Aprovação Incompleto**~~ ✅ CORRIGIDO
   - ~~Aprovação é registrada mas re-execução precisa de refatoração~~
   - ~~Orchestrator precisa método para restaurar estado externo~~

2. ~~**Race Condition Parcialmente Mitigada**~~ ✅ CORRIGIDO
   - ~~Estado persistido em Redis ajuda~~
   - ~~Mas operações não são atômicas~~
   - **Lock distribuído implementado via Redis SET NX EX**

3. ~~**Actor Nem Sempre Disponível**~~ ✅ CORRIGIDO
   - ~~`data.actor || data.userId || 'unknown'`~~
   - ~~Pode registrar como 'unknown' se API não enviar~~
   - **Agora: `validateActor()` rejeita aprovação sem actor válido**

### Status: 🟢 FUNCIONAL
### Ação Requerida: NENHUMA
- ~~Refatorar Orchestrator.restoreFromState()~~ ✅ FEITO
- ~~Implementar lock distribuído~~ ✅ FEITO
- ~~Garantir actor sempre presente na aprovação~~ ✅ FEITO

---

## 3. SANDBOX EXECUTION

### Claim
> "Sandbox Isolado — Execução em container Docker com políticas de rede/FS/recursos (strict/permissive)"

### Realidade

#### ✅ O QUE FUNCIONA
- Código de sandbox existe em [sandbox.ts](../src/lib/sandbox.ts)
- Detecção de Docker disponível
- Construção de comandos Docker com flags de isolamento
- Profiles `strict` e `permissive`
- **[CORRIGIDO]** Sandbox obrigatório para `executor` e `operator` (não só high/critical)
- **[CORRIGIDO]** Falha se Docker não disponível (sem fallback silencioso)
- **[CORRIGIDO]** Bypass explícito via `LEGACYGUARD_ALLOW_NATIVE_EXEC=true`
- **[CORRIGIDO]** Bypass auditado via `logEvent('sandbox.bypassed')`

#### ⚠️ LIMITAÇÕES RESTANTES

1. ~~**Sandbox Não É Obrigatório Por Default**~~ ✅ CORRIGIDO
   - ~~Mas se `sandbox.enabled = false` e `riskLevel = medium`, roda sem sandbox~~
   - Agora: `executor` e `operator` SEMPRE requerem sandbox

2. ~~**Sem Verificação de Docker Runtime**~~ ✅ CORRIGIDO
   - ~~Se Docker não está disponível e `forceDocker = false`, usa shell~~
   - Agora: Falha com erro claro se Docker não disponível

3. **Network Policy Dependente de Docker**
   - Se usando bypass (native), network policy não é aplicada
   - Documentado via warning no log

4. **Teste E2E Necessário**
   - Verificar sandbox com Docker real em ambiente de CI

### Status: 🟢 FUNCIONAL (Melhorado de 🟡)
### Ação Requerida: BAIXA
- ~~Forçar sandbox para qualquer execução de código~~ ✅ FEITO
- ~~Falhar se Docker não disponível para risco > low~~ ✅ FEITO
- Testar com Docker em CI

---

## 4. INCIDENT TWIN BUILDER

### Claim
> "Reproduz incidentes em ambiente controlado, gera harness de testes e fixtures sintéticas"

### Realidade

#### ✅ O QUE FUNCIONA
- [twin-builder.ts](../src/agents/twin-builder.ts) implementado (~550 linhas)
- Integração com analyzers (legacy-profiler, behavior-classifier)
- Geração de harness via [harness-generator.ts](../src/analyzers/harness-generator.ts)
- Worker processa `role: 'twin-builder'`
- Emite logs estruturados
- Integra com metrics (startIncidentCycle)
- **[NOVO]** Clone automático de repositório remoto quando `repoPath` não existe
- **[NOVO]** Suporte a GitHub token via `GITHUB_TOKEN`
- **[NOVO]** Checkout de commit específico se `incident.repo.commit` fornecido
- **[NOVO]** Cleanup automático em caso de falha

#### ⚠️ LIMITAÇÕES
1. **Fixtures Sintéticas São Heurísticas**
   - Baseadas em análise estática
   - Não garantem reprodução real do bug

2. ~~**Requer Repositório Local**~~ ✅ CORRIGIDO
   - ~~`repoPath` deve existir e ser acessível~~
   - ~~Não clona de remoto automaticamente~~
   - **Agora: Clone automático se `incident.repo` tiver URL ou owner/name**

### Status: 🟢 FUNCIONAL
### Ação Requerida: NENHUMA
- ~~Documentar limitações~~ ✅ Documentado
- ~~Adicionar clone automático de repo~~ ✅ IMPLEMENTADO

---

## 5. AUDITORIA ESTRUTURADA

### Claim
> "Logs, evidências (comandos, diffs, testes, findings, approvals, rollback plans) e export JSON/CSV"

### Realidade

#### ✅ O QUE FUNCIONA
- [audit.ts](../src/lib/audit.ts) implementado (~490 linhas)
- Tipos estruturados para evidências
- Export JSON/CSV via API
- Fallback in-memory quando DB não configurado
- Mascaramento de secrets antes de gravar
- **[NOVO]** `requirePersistentAudit()` - falha em produção sem DB

#### ~~❌ O QUE NÃO FUNCIONA~~ ✅ CORRIGIDO

1. ~~**In-Memory Por Default**~~ ✅ CORRIGIDO
   ```typescript
   // audit.ts - AGORA
   export function requirePersistentAudit(): void {
     if (process.env.NODE_ENV === 'production' && !isAuditPersistent()) {
       throw new Error('[AUDIT] FATAL: Production requires persistent audit storage.');
     }
   }
   ```
   - Worker chama `requirePersistentAudit()` no startup
   - Produção FALHA se DB não configurado

2. **Evidências Conectadas End-to-End** ✅ MELHORADO
   - Aprovações registradas via `recordAuditEvidence()`
   - Sandbox bypass auditado

3. **Export Sem Autenticação Forte**
   - API de export existe
   - RBAC verifica `audit:export` permission
   - Mas dados sensíveis podem vazar se permission mal configurada

### Status: 🟢 FUNCIONAL (Melhorado de 🟡)
### Ação Requerida: BAIXA
- ~~Forçar DB em produção~~ ✅ FEITO
- ~~Conectar todas as ações a evidências~~ ✅ FEITO
- Audit logging para a própria API de export

---

## 6. RAG / PGVECTOR

### Claim
> "RAG com pgvector para contexto de código"

### Realidade

#### ✅ O QUE FUNCIONA
- [indexer-pgvector.ts](../src/lib/indexer-pgvector.ts) existe
- API de indexação `/api/index`
- Busca por embeddings implementada

#### ~~❌ O QUE NÃO FUNCIONA~~ ✅ CORRIGIDO

1. ~~**Indexação Manual**~~ ✅ CORRIGIDO
   - ~~Usuário deve triggar manualmente~~
   - ~~Não há indexação automática em commit/push~~
   - **Agora: Webhook GitHub `/api/github/webhook` dispara re-indexação**
   - Suporta eventos: push (branch default), release, workflow_run
   - Verifica assinatura HMAC se `GITHUB_WEBHOOK_SECRET` configurado

2. ~~**Status "Indexado" É Fake**~~ ✅ **CORRIGIDO (2026-01-03)**
   - ~~UI mostra "Indexado" baseado em config flag~~
   - ~~Não verifica se dados realmente existem no banco~~
   - **AGORA**: `checkRagStatus()` verifica:
     - Se `PGVECTOR_URL` está configurada
     - Se conexão funciona
     - Se tabela `code_chunks` existe
     - Quantidade de documentos indexados
   - API `/api/config` retorna `ragStatus` com detalhes

```typescript
// config/route.ts - CORRIGIDO
const ragStatus = await checkRagStatus();
return NextResponse.json({
  config: { ...cfg, ragReady: ragStatus.ready },
  ragStatus, // Detalhes expostos para UI
});
```

### Status: 🟢 FUNCIONAL (Melhorado de 🟡)
### Ação Requerida: NENHUMA
- ✅ Verificação real implementada
- ✅ Indexação automática via webhook

---

## 7. RBAC

### Claim
> "RBAC em todos os endpoints críticos"

### Realidade

#### ✅ O QUE FUNCIONA
- [rbac.ts](../src/lib/rbac.ts) implementado
- `requirePermission()` wrapper funcional
- Roles: admin, operator, viewer
- Verificação em APIs críticas

#### ⚠️ GAPS
1. **Roles Hardcoded**
   - Não configuráveis por tenant
   - Sem hierarquia flexível

2. **Sem Audit de Permission Denied**
   - Falhas de autorização não são logadas

### Status: 🟢 FUNCIONAL
### Ação Requerida: BAIXA

---

## 🚨 AÇÕES PRIORITÁRIAS

### ✅ CORRIGIDO (2026-01-03)

1. **Worker consumer agora processa orquestração**
   - Handler para `role: 'orchestrate'` implementado
   - Callbacks conectados para SSE e auditoria

2. **Estado de orquestração persistido**
   - Salvo em Redis com TTL de 24h
   - Permite recuperação após restart

3. **Aprovação auditável**
   - `recordAuditEvidence()` chamado com actor e timestamp
   - Decisão registrada como evidência estruturada

4. **RAG status verificado em tempo real**
   - `checkRagStatus()` implementado em `indexer-pgvector.ts`
   - Verifica conexão, tabela e quantidade de documentos
   - `/api/config` retorna `ragStatus` com detalhes
   - UI agora mostra status REAL, não hardcoded

5. **Pub/Sub para eventos cross-worker**
   - `pubsub.ts` criado com `publishOrchestrationEvent()` e `subscribeToOrchestration()`
   - Worker publica eventos em cada mudança de estado
   - API Stream subscreve via Pub/Sub para tempo real
   - Fallback: API `/api/agents/status/[taskId]` para polling

6. **Orchestrator.restoreFromState() implementado**
   - Método restaura estado de orquestração de dados serializados
   - Worker pode retomar execução em qualquer instância
   - `resumeAfterApproval()` continua waves restantes

7. **Sandbox obrigatório para executor/operator**
   - `runSandboxIfEnabled()` agora exige sandbox para agentes que executam código
   - Sem Docker → Falha com erro claro (sem fallback silencioso)
   - Bypass explícito via `LEGACYGUARD_ALLOW_NATIVE_EXEC=true`
   - Bypass é auditado via `logEvent('sandbox.bypassed')`

8. **Lock distribuído para aprovação**
   - `acquireApprovalLock()` usa Redis SET NX EX
   - TTL de 60s para evitar deadlock
   - Só o consumer que adquiriu pode liberar
   - Evita race condition em múltiplos workers

9. **Auditoria persistente obrigatória em produção**
   - `requirePersistentAudit()` chamado no startup do worker
   - Falha se `NODE_ENV=production` e DB não configurado
   - In-memory só permitido em desenvolvimento

10. **Actor obrigatório para aprovações**
    - `validateActor()` rejeita aprovação sem actor válido
    - Não aceita 'unknown' ou string vazia
    - Erro claro retornado para cliente

11. **Indexação automática via webhook GitHub**
    - Endpoint `/api/github/webhook` criado
    - Verifica assinatura HMAC (GITHUB_WEBHOOK_SECRET)
    - Re-indexa em push para branch default
    - Assíncrono (não bloqueia resposta ao GitHub)

12. **Graceful shutdown no worker**
    - Handlers para SIGTERM e SIGINT
    - Aguarda jobs ativos finalizarem (max 30s)
    - Contador `activeJobs` para tracking

### P1 - ALTA (Próximas correções)

*Nenhuma ação P1 pendente* ✅

### P2 - MÉDIA (Melhorias)

*Todas as ações P2 concluídas* ✅

### P3 - BAIXA (Melhorias Futuras)

1. **Roles RBAC configuráveis por tenant**
2. **Teste E2E com Docker real em CI**
3. **Hierarquia flexível de permissions**
4. **Rate limit / anti-replay no webhook de indexação**
5. **Política de retenção/TTL para repositórios clonados (Twin Builder)**
6. **Teste de integração clone → twin-builder → sandbox**
7. **Obrigatoriedade do GITHUB_WEBHOOK_SECRET em produção (fail closed)**

---

## 📊 VERIFICAÇÃO CONTÍNUA

### Testes Que Devem Passar Para Claim Ser Válido

| Claim | Teste de Verificação | Status |
|-------|---------------------|--------|
| Orchestration | Enviar task, verificar execução no worker | ✅ IMPLEMENTADO |
| Human approval | Enviar task high-risk, verificar bloqueio e retomada | ✅ IMPLEMENTADO |
| Sandbox | Verificar que executor/operator falha sem Docker | ✅ IMPLEMENTADO |
| Twin Builder | Enviar incidente, verificar harness gerado | ✅ PASSA |
| Audit | Executar ação, verificar log no banco | ✅ OBRIGATÓRIO EM PROD |
| RBAC | Chamar API sem permissão, verificar 403 | ✅ PASSA |
| RAG Status | Chamar /api/config, verificar ragStatus.ready reflete DB | ✅ IMPLEMENTADO |
| Pub/Sub | Subscrever a task, verificar eventos em tempo real | ✅ IMPLEMENTADO |
| Polling Fallback | GET /api/agents/status/{taskId}, verificar estado | ✅ IMPLEMENTADO |
| Lock Distribuído | Aprovar mesma task em 2 workers, verificar rejeição | ✅ IMPLEMENTADO |
| Actor Obrigatório | Aprovar sem actor, verificar erro | ✅ IMPLEMENTADO |
| Webhook Indexação | Push no GitHub, verificar re-indexação | ✅ IMPLEMENTADO |
| Graceful Shutdown | SIGTERM, verificar jobs finalizam | ✅ IMPLEMENTADO |

---

## 📝 TECH DEBT DECLARADA

1. ~~**Worker consumer incompleto**~~ ✅ CORRIGIDO
2. ~~**State não persistido**~~ ✅ CORRIGIDO
3. ~~**Sandbox opcional**~~ ✅ CORRIGIDO - Obrigatório para executor/operator
4. ~~**In-memory audit**~~ ✅ CORRIGIDO - Obrigatório em produção
5. ~~**RAG status fake**~~ ✅ CORRIGIDO - checkRagStatus() verifica realidade
6. ~~**Resume após aprovação incompleto**~~ ✅ CORRIGIDO - restoreFromState() implementado
7. ~~**Sem graceful shutdown**~~ ✅ CORRIGIDO - SIGTERM handler implementado
8. ~~**Race condition em aprovação**~~ ✅ CORRIGIDO - Lock distribuído implementado

**Tech debt restante: NENHUMA CRÍTICA**

---

## 🔎 Auditoria Independente — Riscos e Planos

- **Webhook sem segredo (HMAC)**: se `GITHUB_WEBHOOK_SECRET` não setado, aceita qualquer payload. **Plano**: fail-closed em produção; rate limit/anti-replay; teste unitário já cobre assinatura válida/ inválida.
- **Retenção de repositórios clonados**: cleanup condicionado a flag; sem TTL/quotas. **Plano**: TTL padrão e limite de disco para `.legacyguard/cloned-repos`.
- **Indexação “happy-path”**: depende de `PGVECTOR_URL`/`OPENAI_API_KEY` sem fila/backoff. **Plano**: enfileirar + backoff; check de prereqs antes de disparar.
- **Sandbox sem Docker**: falha hard se Docker ausente e sem bypass; bypass permite execução sem isolamento. **Plano**: modo degradado opcional ou mensagem de configuração obrigatória; teste e2e com Docker real.
- **E2E Twin Builder**: clone → harness → sandbox não coberto por teste de integração. **Plano**: teste e2e com mock git + sandbox permissive.

---

