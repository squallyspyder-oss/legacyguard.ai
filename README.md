# 🛡️ LegacyGuard

> **📜 [LEIA O MANIFESTO](MANIFESTO.md) — Princípios inegociáveis deste projeto**

**Plataforma de orquestração de agentes AI para manutenção segura de código legado.**

---

## O Que É

LegacyGuard ajuda desenvolvedores a **entender, manter e modernizar código legado** usando agentes de IA com controles de segurança rigorosos.

### Claims Principais

| Claim | Status | Verificação |
|-------|--------|-------------|
| Multi-agent orchestration | 🔄 Parcial | Ver [AUDIT.md](docs/AUDIT.md) |
| Human-in-the-loop approval | 🔄 Parcial | Ver [AUDIT.md](docs/AUDIT.md) |
| Sandbox execution | 🔄 Parcial | Ver [AUDIT.md](docs/AUDIT.md) |
| Incident Twin Builder | 🔄 Parcial | Ver [AUDIT.md](docs/AUDIT.md) |
| Auditoria estruturada | 🔄 Parcial | Ver [AUDIT.md](docs/AUDIT.md) |

> ⚠️ **AVISO**: Este sistema está em desenvolvimento ativo. Consulte [docs/AUDIT.md](docs/AUDIT.md) para status real de cada funcionalidade.

---

## Modos de Uso

### 💬 Chat Livre (LegacyAssist)
Assistente conversacional para dúvidas e orientação.

### 🧭 Modo Guiado (Guardian Flow)
Fluxo estruturado passo a passo com validação.

### 🎭 Orquestração Multi-Agente
Coordenação de múltiplos agentes para tarefas complexas.

---

## Agentes

| Agente | Função |
|--------|--------|
| **LegacyAssist** | Chat conversacional |
| **Advisor** | Análise de código |
| **Planner** | Criação de planos |
| **Twin Builder** | Reprodução de incidentes |
| **Reviewer** | Code review |
| **Operator** | Operações Git |
| **Executor** | Merge/deploy |
| **Orchestrator** | Coordenação |

---

## Quick Start

```bash
pnpm install
pnpm dev
```

### Variáveis de Ambiente

```env
OPENAI_API_KEY=sk-...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
GITHUB_ID=...
GITHUB_SECRET=...
```

---

## Documentação

- [docs/AUDIT.md](docs/AUDIT.md) - **Auditoria de realidade do sistema**
- [docs/GUIA_LEGACYGUARD.md](docs/GUIA_LEGACYGUARD.md) - Guia para desenvolvedores
- [TUTORIAL.md](TUTORIAL.md) - Tutorial de deploy

---

## Licença

MIT
