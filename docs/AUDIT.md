# 🔍 AUDIT.md - Auditoria de Realidade do LegacyGuard

**Data:** 2026-01-03  
**Auditor:** Sistema de Verificação Contínua  
**Versão:** 1.0

---

## ⚠️ RESUMO EXECUTIVO

| Claim | Status | Gravidade |
|-------|--------|-----------|
| Multi-agent orchestration | 🟡 PARCIAL | MÉDIA |
| Human-in-the-loop approval | 🟡 PARCIAL | ALTA |
| Sandbox execution | 🟡 PARCIAL | MÉDIA |
| Incident Twin Builder | 🟢 FUNCIONAL | BAIXA |
| Auditoria estruturada | 🟡 PARCIAL | MÉDIA |
| RAG/pgvector | 🟡 PARCIAL | MÉDIA |
| RBAC | 🟢 FUNCIONAL | BAIXA |

**Veredicto:** O sistema tem infraestrutura substancial. Correções críticas foram aplicadas em 2026-01-03:
- ✅ Worker agora processa orquestração
- ✅ Estado é persistido no Redis  
- ✅ Aprovação é auditada

**Gaps restantes:** Resume após aprovação, lock distribuído, sandbox obrigatório.

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

#### ⚠️ LIMITAÇÕES RESTANTES
1. **Restauração de Estado Parcial**
   - Estado é salvo mas `resumeAfterApproval` precisa ser refatorado
   - Orchestrator precisa aceitar estado externo para restauração completa
   
2. **Sem Graceful Shutdown**
   - Worker não tem shutdown gracioso
   - Tarefas em execução podem ser perdidas em restart

### Status: 🟡 PARCIAL (Melhorado de 🔴)
### Ação Requerida: MÉDIA
- Refatorar Orchestrator para aceitar estado externo
- Implementar graceful shutdown no worker

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

#### ⚠️ LIMITAÇÕES RESTANTES

1. **Resume Após Aprovação Incompleto**
   - Aprovação é registrada mas re-execução precisa de refatoração
   - Orchestrator precisa método para restaurar estado externo
   - **TECH DEBT**: Marcado no código

2. **Race Condition Parcialmente Mitigada**
   - Estado persistido em Redis ajuda
   - Mas operações não são atômicas
   - Lock distribuído ainda não implementado

3. **Actor Nem Sempre Disponível**
   - `data.actor || data.userId || 'unknown'`
   - Pode registrar como 'unknown' se API não enviar

### Status: 🟡 PARCIAL (Melhorado de 🔴)
### Ação Requerida: ALTA
- Refatorar Orchestrator.restoreFromState()
- Implementar lock distribuído
- Garantir actor sempre presente na aprovação

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
- Fallback para shell script

#### ❌ O QUE NÃO FUNCIONA

1. **Sandbox Não É Obrigatório Por Default**
   ```typescript
   // sandbox.ts linha 472
   const requiresSandbox = riskLevel === 'high' || riskLevel === 'critical';
   if (!sandbox?.enabled && requiresSandbox) {
     throw new Error('Sandbox obrigatório para tasks de risco alto/crítico');
   }
   ```
   - Isso é verificado no Orchestrator
   - Mas se `sandbox.enabled = false` e `riskLevel = medium`, roda sem sandbox
   - **Configuração padrão não força sandbox**

2. **Sem Verificação de Docker Runtime**
   - Se Docker não está disponível e `forceDocker = false`, usa shell
   - Shell não tem isolamento real
   - Log avisa mas não bloqueia

3. **Network Policy Não Enforcement Real**
   ```typescript
   // sandbox.ts
   const networkArg = networkPolicy === 'none' ? '--network=none' : '--network=bridge';
   ```
   - Se Docker não está disponível, network policy é IGNORADA
   - Fallback shell não implementa network isolation

4. **Teste Real Não Executado**
   - Verificar se `LEGACYGUARD_SANDBOX_ENABLED=true` no ambiente
   - Atualmente está desabilitado em dev por padrão

### Status: 🟡 PARCIAL
### Ação Requerida: ALTA
- Forçar sandbox para qualquer execução de código
- Falhar se Docker não disponível para risco > low
- Implementar validação pós-execução

---

## 4. INCIDENT TWIN BUILDER

### Claim
> "Reproduz incidentes em ambiente controlado, gera harness de testes e fixtures sintéticas"

### Realidade

#### ✅ O QUE FUNCIONA
- [twin-builder.ts](../src/agents/twin-builder.ts) implementado (~340 linhas)
- Integração com analyzers (legacy-profiler, behavior-classifier)
- Geração de harness via [harness-generator.ts](../src/analyzers/harness-generator.ts)
- Worker processa `role: 'twin-builder'`
- Emite logs estruturados
- Integra com metrics (startIncidentCycle)

#### ⚠️ LIMITAÇÕES
1. **Fixtures Sintéticas São Heurísticas**
   - Baseadas em análise estática
   - Não garantem reprodução real do bug

2. **Requer Repositório Local**
   - `repoPath` deve existir e ser acessível
   - Não clona de remoto automaticamente

### Status: 🟢 FUNCIONAL
### Ação Requerida: BAIXA
- Documentar limitações
- Adicionar clone automático de repo

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

#### ❌ O QUE NÃO FUNCIONA

1. **In-Memory Por Default**
   ```typescript
   // audit.ts
   if (!url) {
     // Fallback to in-memory - warn in production
   }
   ```
   - Sem `AUDIT_DB_URL`, logs são perdidos no restart
   - Warning existe mas não bloqueia execução

2. **Evidências Não Conectadas End-to-End**
   - `logEvidence()` existe mas chamado inconsistentemente
   - Approvals não registrados como evidência (ver seção 2)
   - Rollback plans são strings, não verificáveis

3. **Export Sem Autenticação Forte**
   - API de export existe
   - RBAC verifica `audit:export` permission
   - Mas dados sensíveis podem vazar se permission mal configurada

### Status: 🟡 PARCIAL
### Ação Requerida: MÉDIA
- Forçar DB em produção
- Conectar todas as ações a evidências
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

#### ❌ O QUE NÃO FUNCIONA

1. **Indexação Manual**
   - Usuário deve triggar manualmente
   - Não há indexação automática em commit/push

2. **Status "Indexado" É Fake**
   - UI mostra "Indexado" baseado em config flag
   - Não verifica se dados realmente existem no banco

```typescript
// config/route.ts - PROBLEMA
return NextResponse.json({
  ...
  ragReady: true, // HARDCODED, não verifica realidade
});
```

### Status: 🟡 PARCIAL
### Ação Requerida: MÉDIA
- Verificar dados reais antes de declarar "Indexado"
- Implementar indexação em webhook/push

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

### P1 - ALTA (Próximas correções)

1. **Implementar Orchestrator.restoreFromState()**
   - Permitir que aprovação retome execução real
   - Refatorar para aceitar estado externo

2. **Forçar sandbox para execução de código**
   - Tornar sandbox obrigatório para qualquer execução
   - Falhar se Docker não disponível

3. **Verificação real de RAG status**
   - Consultar banco antes de declarar "Indexado"

### P2 - MÉDIA (Melhorias)

4. **Lock distribuído para aprovação**
5. **Forçar auditoria persistente em produção**
6. **Garantir actor sempre presente**

---

## 📊 VERIFICAÇÃO CONTÍNUA

### Testes Que Devem Passar Para Claim Ser Válido

| Claim | Teste de Verificação | Status |
|-------|---------------------|--------|
| Orchestration | Enviar task, verificar execução no worker | ❌ FALHA |
| Human approval | Enviar task high-risk, verificar bloqueio | ❌ FALHA |
| Sandbox | Executar código, verificar isolamento Docker | ⚠️ NÃO TESTADO |
| Twin Builder | Enviar incidente, verificar harness gerado | ✅ PASSA |
| Audit | Executar ação, verificar log no banco | ⚠️ DEPENDE DE CONFIG |
| RBAC | Chamar API sem permissão, verificar 403 | ✅ PASSA |

---

## 📝 TECH DEBT DECLARADA

1. ~~**Worker consumer incompleto**~~ ✅ CORRIGIDO
2. ~~**State não persistido**~~ ✅ CORRIGIDO (parcial - resume precisa refatoração)
3. **Sandbox opcional** - Consequência: Código pode rodar sem isolamento
4. **In-memory audit** - Consequência: Logs perdidos em restart se DB não configurado
5. **RAG status fake** - Consequência: UI mostra status incorreto
6. **Resume após aprovação incompleto** - Consequência: Aprovação registrada mas execução não retoma automaticamente

---

**Última atualização:** 2026-01-03
**Este documento deve ser atualizado após cada mudança significativa no sistema.**
