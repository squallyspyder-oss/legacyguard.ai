# Plano de Implementação Real — Guardian Flow

> Este plano substitui a documentação cosmética por implementação funcional testada.
> Cada etapa só é marcada como concluída após código funcional + testes passando.

---

## Fase 1 — Eliminar Bypasses de Segurança

### 1.1 — Remover modo permissivo quando guardianFlowEnabled=false
- **Problema:** Quando `guardianFlowEnabled=false`, o sistema retorna `approved: true, loaLevel: 1` sem nenhum gate.
- **Solução:** Modo desabilitado deve BLOQUEAR execução, não aprovar silenciosamente.
- **Arquivo:** `src/lib/tool-executors.ts` linhas 625-632
- **Teste:** Verificar que guardianFlow retorna erro quando desabilitado.
- **Status:** [x] CONCLUÍDO ✅ (4 testes passando em tests/guardian-flow-bypass.test.ts)

### 1.2 — Security scan real em checkSafetyGates
- **Problema:** `checkSafetyGates` assume `passed: true` para security_scan sem rodar nada.
- **Solução:** Chamar `runSemgrepScan` de verdade ou falhar explicitamente se indisponível.
- **Arquivo:** `src/lib/tool-executors.ts` linhas 819-826
- **Teste:** Verificar que security_scan executa ou falha com mensagem clara.
- **Status:** [x] CONCLUÍDO ✅ (4 testes passando em tests/guardian-flow-security-scan.test.ts)

### 1.3 — Blast radius real em checkSafetyGates
- **Problema:** Cálculo de blast radius é simplista (apenas conta arquivos × 10).
- **Solução:** Usar análise de dependências real via getGraph.
- **Arquivo:** `src/lib/tool-executors.ts` linhas 806-817
- **Teste:** Verificar que arquivos com muitas dependências têm score maior.
- **Status:** [x] CONCLUÍDO ✅ (6 testes passando em tests/guardian-flow-blast-radius.test.ts)

---

## Fase 2 — Sistema de Aprovações Funcional

### 2.1 — Criar store de aprovações persistente
- **Problema:** Aprovações não são persistidas; ficam eternamente "pending".
- **Solução:** Criar módulo `src/lib/approval-store.ts` com persistência em arquivo/DB.
- **Arquivo:** Novo `src/lib/approval-store.ts`
- **Teste:** CRUD de aprovações + expiração automática.
- **Status:** [x] CONCLUÍDO ✅ (19 testes passando em tests/approval-store.test.ts)

### 2.2 — Validar approvalId antes de executar
- **Problema:** `requestApproval` gera ID mas ninguém valida antes de agir.
- **Solução:** Adicionar `validateApproval(approvalId)` que verifica store.
- **Arquivo:** `src/lib/tool-executors.ts` + `approval-store.ts`
- **Teste:** Execução bloqueada sem approval válido; permitida com approval válido.
- **Status:** [x] CONCLUÍDO ✅ (7 testes passando em tests/guardian-flow-approval-integration.test.ts)

### 2.3 — API endpoint para aprovar/rejeitar
- **Problema:** Não existe forma de um humano aprovar via UI/API.
- **Solução:** Criar `POST /api/approvals/[id]/approve` e `/reject`.
- **Arquivo:** Novo `src/app/api/approvals/[id]/route.ts`
- **Teste:** Aprovar muda status; rejeitar bloqueia execução.
- **Status:** [x] CONCLUÍDO ✅ (12 testes passando em tests/approvals-api.test.ts)

---

## Fase 3 — Gate Determinístico Robusto

### 3.1 — Fallback quando Docker indisponível
- **Problema:** Se Docker não existe, gate falha sem alternativa.
- **Solução:** Detectar Docker no startup; se ausente, usar isolamento via subprocess com timeout.
- **Arquivo:** `src/lib/sandbox.ts`
- **Teste:** Gate funciona com e sem Docker (modos diferentes).
- **Status:** [x] CONCLUÍDO ✅ (3 testes passando em tests/sandbox-fallback.test.ts)

### 3.2 — Validar saída estruturada (não apenas hash)
- **Problema:** Hash compara tudo incluindo timestamps/noise.
- **Solução:** Permitir extração de campos específicos para comparação.
- **Arquivo:** `src/lib/tool-executors.ts` runDeterministicRuns
- **Teste:** Ignorar campos voláteis; detectar diferenças reais.
- **Status:** [x] CONCLUÍDO ✅ (3 testes passando em tests/run-deterministic-structured.test.ts)

---

## Fase 4 — Journaling Real com Auditoria

### 4.1 — Testes para buildExecutionPlan e indexConversation
- **Problema:** Helpers de journaling não têm testes.
- **Solução:** Adicionar testes em `tests/execution-journal.test.ts`.
- **Arquivo:** Novo `tests/execution-journal.test.ts`
- **Teste:** Gera markdown correto; sanitiza planId; cria diretório.
- **Status:** [x] CONCLUÍDO ✅ (2 testes passando em tests/execution-journal.test.ts)

### 4.2 — Integrar journaling com audit trail
- **Problema:** Journaling escreve arquivos mas não registra em audit log.
- **Solução:** Chamar `logEvent` ao criar plano/indexar conversa.
- **Arquivo:** `src/lib/execution-journal.ts`
- **Teste:** Verificar que audit log é chamado.
- **Status:** [x] CONCLUÍDO ✅ (coberto em tests/execution-journal.test.ts)

### 4.3 — Limite de tamanho e rotação
- **Problema:** Sem limites, docs/conversas pode crescer indefinidamente.
- **Solução:** Limitar tamanho de conversa; rotacionar arquivos antigos.
- **Arquivo:** `src/lib/execution-journal.ts`
- **Teste:** Conversas grandes são truncadas; arquivos antigos removidos.
- **Status:** [ ] Pendente

---

## Fase 5 — Execução Real (não apenas dry-run)

### 5.1 — Implementar execução real para LOA 1
- **Problema:** LOA 1 retorna "dry run" sem fazer nada.
- **Solução:** Para ações seguras (format, lint), executar de verdade.
- **Arquivo:** `src/app/api/guardian-flow/route.ts` linhas 226-270
- **Teste:** Ação LOA 1 realmente modifica arquivos em sandbox.
- **Status:** [x] CONCLUÍDO ✅ (3 testes passando em tests/guardian-flow-loa1-execution.test.ts)

### 5.2 — Pipeline de execução com rollback
- **Problema:** Não há mecanismo de rollback após execução.
- **Solução:** Criar snapshot antes de executar; restaurar se falhar.
- **Arquivo:** Novo `src/lib/execution-pipeline.ts`
- **Teste:** Falha após execução restaura estado anterior.
- **Status:** [x] CONCLUÍDO ✅ (3 testes passando em tests/execution-pipeline.test.ts)

---

## Tracking de Progresso

| Fase | Etapa | Status | Testes |
|------|-------|--------|--------|
| 1 | 1.1 Remover bypass | [x] | [x] |
| 1 | 1.2 Security scan real | [x] | [x] |
| 1 | 1.3 Blast radius real | [x] | [x] |
| 2 | 2.1 Approval store | [x] | [x] |
| 2 | 2.2 Validar approvalId | [x] | [x] |
| 2 | 2.3 API approvals | [x] | [x] |
| 3 | 3.1 Docker fallback | [x] | [x] |
| 3 | 3.2 Saída estruturada | [x] | [x] |
| 4 | 4.1 Testes journaling | [x] | [x] |
| 4 | 4.2 Audit integration | [x] | [x] |
| 4 | 4.3 Limites/rotação | [ ] | [ ] |
| 5 | 5.1 Execução LOA 1 | [x] | [x] |
| 5 | 5.2 Pipeline rollback | [x] | [x] |

---

## Início: Fase 1.1
