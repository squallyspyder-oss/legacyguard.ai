# Execution Guard Plan

> Before writing any code, switch to Execution Guard mode and answer all questions. If any answer is unclear or missing: **STOP. Do not code. Report what is undefined.**

## Checklist de Perguntas (aplica a cada etapa)
1. What exact user or system event triggers this?
2. Which agent is responsible at each step?
3. Where does state live before, during, and after execution?
4. What happens if this step fails?
5. Is there a rollback? Where is it enforced?
6. How is this action audited?
7. Does this bypass any human approval or RBAC rule?
8. How would this fail silently?

Se qualquer resposta for incerta: **STOP** e reportar a lacuna.

---

## ~~Fase 1 — Sandbox Real (Docker rootless, rede bloqueada) — 100%~~
- **Objetivo:** Isolar execução de comandos.
- **Passos e respostas:**
  - Evento: chamada `runSandbox` via assistente/worker.
  - Agente: Executor/Worker; Orchestrator autoriza; Guardian Flow gateia LOA.
  - Estado: antes (payload/intent + LOA); durante (container ID, stdout/stderr, exit code, timeout); após (logs, artefatos em volume isolado, status em store de tarefas).
  - Falha: timeout/exit≠0/container error → marcar tarefa failed e retornar log.
  - Rollback: destruir container/volumes; sem efeitos permanentes (workspace RO).
  - Auditoria: log em audit trail com intent, LOA, taskId, containerId, hash do comando.
  - Approval/RBAC: requer permissão `execute` + LOA gates; nenhum bypass permitido.
  - Silent fail risk: truncamento de logs ou perda de stdout; mitigar guardando stdout/stderr completos + exit code + duration.

## ~~Fase 1 — Safety Gates Efetivos — 100%~~
- **Objetivo:** Gates reais para LOA≥2.
- **Passos:**
  - Evento: `checkSafetyGates` ou guardianFlow auto-invocado antes de ação mutável.
  - Agente: Planner chama; Reviewer valida; Orchestrator bloqueia se gate falhar.
  - Estado: antes (intent, LOA); durante (resultados de intent validation, blast radius, SAST, deterministic runs); após (decisão allow/deny + artefatos dos gates).
  - Falha: gate falha → negar execução; fornecer motivo e log.
  - Rollback: não há efeitos aplicados; gate ocorre antes da ação.
  - Auditoria: registrar cada gate com carimbo de tempo, LOA, entradas, saídas.
  - Approval/RBAC: se LOA exige aprovação, gate requer approvalId válido; nenhum bypass via payload.
  - Silent fail risk: gate retornar success padrão; mitigar com required=true e checagem de artefato (ex.: SAST deve produzir findings list, deterministic deve listar runs).

## ~~Fase 1 — Aprovação Humana Fora do Agente — 100%~~
- **Objetivo:** Approval externo não controlado pelo LLM.
- **Passos:**
  - Evento: ação LOA≥2 solicita aprovação.
  - Agente: Orchestrator cria approvalId; Interface/Admin aprova; Executor só prossegue com approvalId válido.
  - Estado: antes (pedido pendente em DB/kv); durante (status pending/approved/denied/expired); após (link entre taskId e approvalId armazenado).
  - Falha: approval ausente/expirada → negar execução.
  - Rollback: não aplicável; ação bloqueada.
  - Auditoria: log de criação, decisão, quem aprovou, timestamp, expiração.
  - Approval/RBAC: aprovação exige role adequada; Executor rejeita se role ou assinatura inválida.
  - Silent fail risk: reuso de approvalId; mitigar com one-time token e expiração curta.

## ~~Fase 2 — RAG Confiável (pgvector obrigatório em prod) — 100%~~
- **Objetivo:** Remover ilusão de contexto.
- **Passos:**
  - Evento: chamada searchRAG em produção.
  - Agente: Advisor/Planner antes de responder ou propor mudança.
  - Estado: antes (consulta); durante (fonte pgvector online, versão do índice); após (contexto anexado + metadados de origem).
  - Falha: índice offline → fallback lexical só se sinalizado + força LOA alto; senão, bloquear.
  - Rollback: não aplicável.
  - Auditoria: logar query, backend usado, contagem de hits, se fallback foi acionado.
  - Approval/RBAC: leitura; sem bypass de escrita.
  - Silent fail risk: contexto vazio não sinalizado; mitigar exigindo `count>0` ou bandeira de "contexto ausente" para o modelo.

## ~~Fase 2 — Anti Prompt/LLM Bypass — 100%~~
- **Objetivo:** Minimizar injeção e decisões unilaterais.
- **Passos:**
  - Evento: antes de enviar prompt ao modelo e antes de executar toolcall crítico.
  - Agente: Guardrails middleware; Orchestrator aplica policies.
  - Estado: antes (prompt bruto); durante (prompt limpo + allowlist de ferramentas por LOA); após (log do prompt filtrado e das ferramentas permitidas).
  - Falha: detecção de bypass → bloquear e pedir reformulação.
  - Rollback: não aplicável.
  - Auditoria: registrar prompt original (com mascaramento) e versão filtrada.
  - Approval/RBAC: não alterar requerimentos de aprovação; apenas restringir.
  - Silent fail risk: filtro inoperante; mitigar com teste automatizado que garante bloqueio de tokens proibidos e ferramentas não permitidas.

## ~~Fase 3 — Rollback e Auto-Reparo — 100%~~
- **Objetivo:** Garantir reversão automática pós-deploy.
- **Passos:**
  - Evento: deploy promovido pelo Executor.
  - Agente: Executor aplica; Monitor/Health-check verifica; Orchestrator decide rollback.
  - Estado: antes (snapshot git + migrações reversíveis + feature flags); durante (deploy status, health probes); após (ou estado promovido, ou rollback aplicado, logs).
  - Falha: health-check falha → executar rollback automático.
  - Rollback: enforced via script automatizado (git reset/feature-flag/migração down) em ambiente isolado; aprovado previamente.
  - Auditoria: log de deploy, health, decisão de rollback, duração.
  - Approval/RBAC: deploy/rollback exige `orchestrate` e approval se LOA≥2.
  - Silent fail risk: health-check não cobrindo rota crítica; mitigar com sondas definidas por serviço e checagem sintética.

## ~~Fase Transversal — Observabilidade & Auditoria — 100%~~
- **Objetivo:** Rastrear decisões e efeitos.
- **Passos:**
  - Evento: qualquer toolcall crítico (sandbox, gates, approval, deploy).
  - Agente: Auditor/logger.
  - Estado: antes (intent/LOA/taskId); durante (resultado, duração); após (registro imutável/WORM).
  - Falha: falha de escrita em auditoria → marcar operação como não-conforme e bloquear progressão.
  - Rollback: não aplicável.
  - Auditoria: sempre; assinar logs.
  - Approval/RBAC: logs acessíveis conforme RBAC; não devem ser editáveis.
  - Silent fail risk: perda de logs; mitigar com envio duplicado (primário + WORM) e alertas se fila acumular.
