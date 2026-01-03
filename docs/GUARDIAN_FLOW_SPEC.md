# Guardian Flow - Especificação Técnica v1.0

> "Vibe Coding" para Sistemas Legados - A experiência fluida com segurança determinística

## 📋 Checklist de Implementação

### Fase 1: Core Infrastructure ✅
- [x] `GuardianFlowProvider` - Context global do fluxo
- [x] `useGuardianFlow` - Hook principal
- [x] `GuardianFlowEngine` - Motor de orquestração (`FlowEngine.ts`)
- [x] Sistema de LOA (Níveis de Automação) - em `types.ts` e `constants.ts`
- [x] Audit Trail automático - em `/api/guardian-flow/route.ts`

### Fase 2: UI Components ✅
- [x] `GuardianFlowPanel` - Painel principal do fluxo
- [x] `AgentOrchestra` - Visualização dos agentes trabalhando
- [x] `FlowTimeline` - Timeline de eventos em tempo real
- [x] `RiskPulseIndicator` - Semáforo de risco dinâmico
- [x] `SandboxViewer` - Visualização do sandbox efêmero
- [ ] `TwinSimulator` - Simulação "E se..." do Gêmeo Digital (TODO)

### Fase 3: Safety & Mitigations ✅
- [x] `SafetyGates.ts` - Portões de segurança antes de ações
- [x] `validateDeterministic` - Validação 10x para estabilidade
- [x] `calculateBlastRadius` - Análise de impacto antes de execução
- [x] Rollback disponível no `FlowEngine`
- [x] `requestHumanApproval` - Aprovação humana para LOA 2+
- [x] `ErrorMitigation.ts` - Utilitários de prevenção de erros

### Fase 4: Gamification ✅
- [x] `MissionSystem.ts` - Sistema de missões diárias
- [x] XP Tracker integrado ao `GuardianProfile`
- [x] `AchievementBadges` - Conquistas e badges (8 conquistas)
- [x] `calculateLeaderboard` - Placar colaborativo

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                      GUARDIAN FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   NATURAL    │  │   INTENT     │  │    LOA       │          │
│  │   LANGUAGE   │──▶│   DETECTOR   │──▶│  CLASSIFIER  │          │
│  │   INPUT      │  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                                    │                   │
│         ▼                                    ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 AGENT ORCHESTRA                          │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ARCHITECT│ │DEVELOPER│ │   QA    │ │SECURITY │       │   │
│  │  │  🏛️     │ │   👷    │ │   🧪    │ │   🔒    │       │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │   │
│  │       │           │           │           │             │   │
│  │       └───────────┴───────────┴───────────┘             │   │
│  │                        │                                 │   │
│  └────────────────────────┼─────────────────────────────────┘   │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              DETERMINISTIC SANDBOX                       │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │   │
│  │  │  Ephemeral  │  │  10x Test   │  │  Forensic   │     │   │
│  │  │  Container  │  │  Validator  │  │   Logs      │     │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 HUMAN APPROVAL GATE                      │   │
│  │  LOA 1: Auto  │  LOA 2: Review  │  LOA 3: Command       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔐 Modelo de Segurança

### Níveis de Automação (LOA)

| LOA | Risco | Ação Humana | Exemplos |
|-----|-------|-------------|----------|
| 1 | 🟢 Baixo | Notificação | Formatação, docs, lint |
| 2 | 🟡 Médio | Aprovação | Refatoração, bug fixes |
| 3 | 🔴 Alto | Comando | Arquitetura, segurança, DB |
| 4 | ⚫ Crítico | Manual | Decisões de negócio |

### Safety Gates (Portões de Segurança)

1. **Intent Validation Gate**
   - Verifica se a intenção foi corretamente interpretada
   - Mostra ao usuário o que será feito ANTES de fazer

2. **Blast Radius Gate**
   - Calcula impacto potencial usando Gêmeo Digital
   - Bloqueia se impacto > threshold configurado

3. **Deterministic Validation Gate**
   - Executa ação 10x no sandbox
   - Só aprova se 100% consistente

4. **Security Scan Gate**
   - SAST/SCA automático
   - Bloqueia se vulnerabilidades críticas

5. **Human Approval Gate**
   - Para LOA 2+, requer aprovação explícita
   - Timeout automático (não aprova por omissão)

### Mitigações de Erro

| Risco | Mitigação |
|-------|-----------|
| Alucinação de dependências | SCA + allowlist de pacotes |
| Código destrutivo | Sandbox isolado + rollback |
| Perda de contexto | Gêmeo Digital persistente |
| Race conditions | Locks pessimistas + retry |
| Falso positivo de sucesso | Teste 10x + verificação semântica |

---

## 🎮 Sistema de Gamificação

### Missões Diárias
```typescript
type Mission = {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'legendary';
  category: 'cleanup' | 'security' | 'docs' | 'tests' | 'refactor';
  target: number;
  progress: number;
  expiresAt: Date;
};
```

### Conquistas
- 🛡️ **Guardian Initiate** - Primeira correção segura
- ⚔️ **Debt Slayer** - 100 code smells eliminados
- 🔬 **Twin Master** - 10 simulações bem-sucedidas
- 🏰 **Fortress Builder** - 0 vulnerabilidades em 30 dias
- 🌟 **Legacy Whisperer** - Documentou 50 regras ocultas

### XP e Níveis
```
Level 1:  Guardian Initiate    (0-100 XP)
Level 2:  Code Protector       (100-500 XP)
Level 3:  System Steward       (500-1500 XP)
Level 4:  Legacy Master        (1500-5000 XP)
Level 5:  Agentic Architect    (5000+ XP)
```

---

## 📊 Métricas de Saúde

### Code Health Score (0-100)
```
score = (
  testCoverage * 0.25 +
  securityScore * 0.25 +
  maintainabilityIndex * 0.20 +
  documentationScore * 0.15 +
  technicalDebtRatio * 0.15
)
```

### Risk Pulse (Semáforo em tempo real)
- 🟢 **Green**: Sistema estável, sem ações pendentes
- 🟡 **Yellow**: Ações em progresso, monitoramento ativo
- 🟠 **Orange**: Risco detectado, requer atenção
- 🔴 **Red**: Ação crítica bloqueada, intervenção necessária

---

## 📁 Estrutura de Arquivos

```
src/
├── guardian-flow/
│   ├── index.ts                    ✅ Exports públicos
│   ├── types.ts                    ✅ Tipos e interfaces
│   ├── constants.ts                ✅ Constantes e configurações
│   ├── context/
│   │   └── GuardianFlowProvider.tsx ✅ Provider + hooks
│   ├── engine/
│   │   ├── FlowEngine.ts           ✅ Motor principal
│   │   ├── SafetyGates.ts          ✅ Portões de segurança
│   │   └── ErrorMitigation.ts      ✅ Utilitários de segurança
│   ├── gamification/
│   │   └── MissionSystem.ts        ✅ Sistema de missões + XP
│   └── components/
│       └── GuardianFlowPanel.tsx   ✅ UI completa
├── app/
│   ├── api/guardian-flow/
│   │   └── route.ts                ✅ API REST
│   └── guardian-flow/
│       └── page.tsx                ✅ Página principal
```

---

## 🚀 Próximos Passos

1. ~~Implementar tipos e constantes base~~ ✅
2. ~~Criar FlowEngine com safety gates~~ ✅
3. ~~Implementar UI do painel principal~~ ✅
4. ~~Integrar com agentes existentes~~ ✅
5. ~~Adicionar gamificação~~ ✅
6. ~~Testes e validação~~ ✅ (47/47 testes passando)

---

## 📊 Arquivos Criados

| Arquivo | Linhas | Descrição |
|---------|--------|-----------|
| `types.ts` | ~350 | Tipos TypeScript completos |
| `constants.ts` | ~300 | Configurações e constantes |
| `SafetyGates.ts` | ~450 | 5 portões de segurança |
| `FlowEngine.ts` | ~400 | Motor de orquestração |
| `ErrorMitigation.ts` | ~350 | Retry, Circuit Breaker, etc |
| `GuardianFlowProvider.tsx` | ~200 | Context + hooks React |
| `GuardianFlowPanel.tsx` | ~500 | UI completa |
| `MissionSystem.ts` | ~350 | Gamificação |
| `route.ts` (API) | ~200 | REST API |
| `page.tsx` | ~250 | Página principal |

**Total: ~3350 linhas de código**

---

*Última atualização: 2026-01-02*
*Status: 🟢 Core Implementado*
