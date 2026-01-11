# 🛡️ LegacyGuard

> **📜 [LEIA O MANIFESTO](MANIFESTO.md)** — princípios inegociáveis. Este README reflete o que está realmente implementado, não marketing.

Plataforma de orquestração de agentes para manutenção segura de código legado. Focada em fluxos determinísticos, aprovação humana obrigatória para risco e execução em sandbox auditável.

---

## Realidade em 2026-01-07 (build verificado)

| Claim | Status real | Prova rápida |
|-------|-------------|--------------|
| Orquestração multi-agente | 🟢 Funcional | [docs/AUDIT.md](docs/AUDIT.md#L24-L89), [src/agents/orchestrator.ts](src/agents/orchestrator.ts) |
| Aprovação humana obrigatória | 🟢 Funcional | [docs/AUDIT.md](docs/AUDIT.md#L91-L182), [src/app/api/approvals/[id]/route.ts](src/app/api/approvals/%5Bid%5D/route.ts) |
| Execução em sandbox Docker | 🟢 Funcional | [docs/AUDIT.md](docs/AUDIT.md#L184-L240), [src/lib/sandbox.ts](src/lib/sandbox.ts) |
| Incident Twin Builder | 🟢 Funcional | [docs/AUDIT.md](docs/AUDIT.md#L242-L304), [src/agents/twin-builder.ts](src/agents/twin-builder.ts) |
| Auditoria estruturada | 🟢 Funcional | [docs/AUDIT.md](docs/AUDIT.md#L306-L360), [src/lib/execution-journal.ts](src/lib/execution-journal.ts) |
| RBAC e approvals API | 🟢 Funcional | [docs/AUDIT.md](docs/AUDIT.md#L24-L89), [tests/approvals-api.test.ts](tests/approvals-api.test.ts) |

> Última auditoria externa: 2026-01-07. 304 testes passando. Vulnerabilidades P0/P1/P2 marcadas como corrigidas em [docs/AUDIT.md](docs/AUDIT.md#L12-L62).

---

## Como o sistema opera

- **Agentes**: planner, advisor, reviewer, operator, executor e twin builder coordenados pelo orchestrator. Estado e pub/sub ficam no Redis para retomada e broadcast. Ver [src/agents](src/agents).
- **Fluxo guardian**: rota [src/app/api/guardian-flow/route.ts](src/app/api/guardian-flow/route.ts) gera plano com `requiresApproval` quando risco alto/crítico; execução pausa até aprovação.
- **Gate de aprovação**: endpoints em [src/app/api/approvals/[id]/route.ts](src/app/api/approvals/%5Bid%5D/route.ts) exigem sessão + `requirePermission('approve')`; `decidedBy` vem da sessão e é auditado.
- **Sandbox**: executor e operator sempre rodam em Docker (profiles strict/permissive) via [src/lib/sandbox.ts](src/lib/sandbox.ts); bypass só com `LEGACYGUARD_ALLOW_NATIVE_EXEC` e é logado.
- **Audit trail e journaling**: [src/lib/execution-journal.ts](src/lib/execution-journal.ts) grava plano/conversa e emite `logEvent`; journaling tem limites/rotação pendentes (ver Gaps).
- **Rollback**: [src/lib/execution-pipeline.ts](src/lib/execution-pipeline.ts) cria snapshot antes da execução e restaura em falha.

---

## Modos de uso

- Chat livre (LegacyAssist) para perguntas rápidas.
- Guardian Flow (modo guiado) com validação, approvals e sandbox.
- Orquestração multi-agente para tarefas complexas e Incident Twin Builder para reproduzir incidentes.

---

## Setup rápido

```bash
pnpm install
pnpm dev
```

### Variáveis obrigatórias

```env
OPENAI_API_KEY=sk-...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GITHUB_ID=...
GITHUB_SECRET=...
```

---

## Gaps conhecidos (devem ser acompanhados)

- Rotação/limite de journaling ainda pendente. Ver [docs/REAL_IMPLEMENTATION_PLAN.md](docs/REAL_IMPLEMENTATION_PLAN.md#L85-L121).
- Continue seguindo [docs/AUDIT.md](docs/AUDIT.md) para status de correções futuras.

---

## Documentação

- [docs/AUDIT.md](docs/AUDIT.md) — auditoria de realidade e vulnerabilidades
- [docs/GUIA_LEGACYGUARD.md](docs/GUIA_LEGACYGUARD.md) — guia para devs
- [TUTORIAL.md](TUTORIAL.md) — tutorial de deploy

---

## Licença

MIT
