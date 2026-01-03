# 🌐 SITE_AUDIT.md — Auditoria do Site LegacyGuard

**Data:** 2026-01-03  
**Versão:** 1.0  
**Escopo:** Frontend, UX, componentes visuais, funcionalidade dos toggles

---

## 📊 RESUMO EXECUTIVO

| Área | Status | Prioridade |
|------|--------|------------|
| Estrutura de Componentes | 🟢 Sólida | - |
| Persistência de Config | 🟢 Funcional | - |
| Toggles → Backend | � Funcional | ✅ P0 CORRIGIDO |
| Feedback Visual | 🟢 Corrigido | ✅ P1 CORRIGIDO |
| Responsividade | 🟡 Não testado | P2 |
| Acessibilidade | 🔴 Ausente | P2 |
| Landing Page Separada | ❓ A decidir | P3 |

---

## 1. ARQUITETURA DO SITE

### 1.1 Stack Tecnológico

| Tecnologia | Versão | Uso |
|------------|--------|-----|
| Next.js | 16.1.0 | Framework React SSR |
| React | 19.x | UI Components |
| Tailwind CSS | 4.x | Estilização |
| next-auth | 5.x | Autenticação OAuth |
| Lucide React | - | Ícones |
| Turbopack | - | Dev bundler |

### 1.2 Estrutura de Componentes

```
src/
├── app/
│   ├── page.tsx              # Entry point → MainLayout
│   ├── layout.tsx            # Root layout + Providers
│   ├── globals.css           # Estilos globais
│   └── Providers.tsx         # SessionProvider wrapper
│
├── components/
│   ├── layout/
│   │   ├── MainLayout.tsx    # Orquestrador principal (settings state)
│   │   ├── Sidebar.tsx       # Navegação lateral
│   │   └── Header.tsx        # Barra superior
│   │
│   ├── chat/
│   │   ├── ChatContainer.tsx # Container principal do chat (800 linhas)
│   │   ├── ChatInput.tsx     # Input de mensagens
│   │   └── MessageList.tsx   # Lista de mensagens
│   │
│   ├── settings/
│   │   └── SettingsPanel.tsx # Painel de configurações (851 linhas)
│   │
│   ├── repo/
│   │   └── ImportRepoModal.tsx # Modal de importação (713 linhas)
│   │
│   └── auth/
│       └── LoginButton.tsx   # Botão de login OAuth
```

### 1.3 Fluxo de Dados

```
[User Action]
     ↓
[Component State (React)]
     ↓
[API Call (/api/config)]
     ↓
[File Persistence (.legacyguard/config.json)]
     ↓
[Backend reads config on demand]
```

---

## 2. CHECKLIST DE FUNCIONALIDADES

### 2.1 Autenticação

| Feature | Status | Arquivo | Notas |
|---------|--------|---------|-------|
| Login GitHub OAuth | ✅ Funcional | `api/auth/[...nextauth]/route.ts` | Testado |
| Sessão persistente | ✅ Funcional | next-auth | Cookie-based |
| Logout | ✅ Funcional | - | Redirect correto |
| Avatar do usuário | ✅ Funcional | `SettingsPanel.tsx` | Carrega do GitHub |
| User settings per-user | ✅ Funcional | `api/user/settings/route.ts` | Persiste em `.legacyguard/users/` |

### 2.2 Toggles de Configuração

| Toggle | UI Location | Persiste? | Backend Lê? | Efetivo? |
|--------|-------------|-----------|-------------|----------|
| `workerEnabled` | Infra tab | ✅ | ✅ | ✅ |
| `sandboxEnabled` | Security tab | ✅ | ✅ | ✅ |
| `sandboxMode` | Security tab | ✅ | ✅ | ✅ |
| `safeMode` | Security tab | ✅ | ✅ | ✅ |
| `reviewGate` | Security tab | ✅ | ✅ | ✅ **CORRIGIDO 2026-01-03** |
| `maskingEnabled` | Security tab | ✅ | ✅ | ✅ **CORRIGIDO 2026-01-03** |
| `apiEnabled` | Infra tab | ✅ | ❓ | ❓ A verificar |
| `deepSearch` | Data tab | ✅ | ❓ | ❓ A verificar |
| `ragReady` | Data tab | ✅ (read-only) | ✅ | ✅ |
| `ragDocumentCount` | Data tab | ✅ (read-only) | ✅ | ✅ **NOVO 2026-01-03** |

### 2.3 Import de Repositórios

| Modo | Status | Endpoint | Notas |
|------|--------|----------|-------|
| GitHub (autenticado) | ✅ Funcional | `/api/index` (clone-github) | Lista repos privados |
| URL Pública | ✅ Funcional | `/api/index` (index-url) | Clone público |
| Git Clone (SSH/HTTPS) | ✅ Funcional | `/api/index` (clone) | Branch customizável |
| Upload Local | ✅ Funcional | `/api/index` (upload) | FormData |
| Indexar path local | ✅ Funcional | `/api/index` (index-local) | Server-side only |

### 2.4 Chat Interface

| Feature | Status | Arquivo | Notas |
|---------|--------|---------|-------|
| Enviar mensagem | ✅ Funcional | `ChatContainer.tsx` | - |
| Streaming response | ⚠️ Parcial | - | Implementado mas nem todos endpoints suportam |
| Agent selector | ✅ Funcional | `AgentSelector.tsx` | 6 agentes disponíveis |
| Quick actions | ✅ Funcional | `ChatContainer.tsx` | Dropdown de ações |
| File upload | ✅ Funcional | - | Múltiplos arquivos |
| Markdown rendering | ✅ Funcional | - | Code blocks, links |
| Copy code | ❓ A verificar | - | Botão existe |
| Approval buttons | ✅ Funcional | - | Para orquestrações pendentes |

### 2.5 Sidebar

| Feature | Status | Notas |
|---------|--------|-------|
| Status badges (Safe, Review, RAG) | ✅ Visual | Reflete settings |
| Sessions list | ⚠️ Vazio | API funciona mas sem persistência real |
| New chat | ✅ Funcional | - |
| Import repo button | ✅ Funcional | Abre modal |
| Settings button | ✅ Funcional | Abre panel |

---

## 3. ITENS PARA VERIFICAÇÃO POSTERIOR

### 3.1 Prioridade Alta (P0)

- [x] **reviewGate não é enviado ao backend** ✅ CORRIGIDO 2026-01-03
  - Arquivo: `src/components/chat/ChatContainer.tsx`
  - Solução: Adicionado `reviewGate: settings.reviewGate` em todas requests /api/agents
  - Backend: `src/agents/orchestrator.ts` força `requiresApproval=true` quando reviewGate ativo

- [x] **maskingEnabled não tem implementação** ✅ CORRIGIDO 2026-01-03
  - Arquivo: `src/lib/config.ts` + `src/lib/audit.ts`
  - Solução: `isMaskingEnabled()` lê config, `logEvent()` condiciona `sanitizeMetadata`

### 3.2 Prioridade Média (P1)

- [x] **RAG status "Indexado" quando não há documentos** ✅ CORRIGIDO 2026-01-03
  - Arquivo: `src/components/settings/SettingsPanel.tsx`
  - Solução: UI agora mostra "Conectado (0 docs)" com warning quando `documentCount === 0`
  - Frontend recebe `ragDocumentCount` via `/api/config` response

- [x] **"Boas Práticas" são decorativas** ✅ CORRIGIDO 2026-01-03
  - Arquivo: `src/components/settings/SettingsPanel.tsx`
  - Solução: Checkmarks agora refletem `settings.sandboxEnabled`, `safeMode`, `reviewGate`, `maskingEnabled`

- [ ] **Notificações email/desktop não implementadas**
  - Arquivo: `src/components/settings/SettingsPanel.tsx`
  - Problema: Toggles existem mas não há worker de notificações
  - Impacto: Funcionalidade prometida não existe
  - Status: Permanece como documentação de feature futura

### 3.3 Prioridade Baixa (P2)

- [ ] **apiEnabled toggle** — verificar se afeta algo
- [ ] **deepSearch toggle** — verificar se é usado na busca
- [ ] **Tema (light/dark/system)** — verificar se persiste corretamente
- [ ] **Atalhos de teclado** — verificar se funcionam
- [ ] **Responsividade mobile** — não testado
- [ ] **Acessibilidade (WCAG)** — não implementado

---

## 4. ANÁLISE VISUAL

### 4.1 Pontos Fortes

| Aspecto | Avaliação |
|---------|-----------|
| Design System | Consistente (Tailwind + custom tokens) |
| Tema escuro | Bem implementado, cores agradáveis |
| Ícones | Lucide React, consistente |
| Espaçamento | Bom uso de padding/margin |
| Hierarquia visual | Clara (headers, sections, cards) |

### 4.2 Pontos Fracos

| Aspecto | Problema | Sugestão |
|---------|----------|----------|
| Estados vazios | Sem ilustrações ou mensagens amigáveis | Adicionar empty states |
| Loading states | Spinner genérico | Skeleton loaders contextuais |
| Feedback de erro | Toast básico ou inline | Sistema de notificação mais robusto |
| Onboarding | Inexistente | Tour guiado para novos usuários |
| Microinterações | Poucas | Adicionar hover effects, transitions |

### 4.3 Screenshots Necessários (TODO)

- [ ] Landing page inicial (sem login)
- [ ] Chat vazio (primeiro uso)
- [ ] Settings panel aberto
- [ ] Import modal em cada modo
- [ ] Estado de erro
- [ ] Mobile view

---

## 5. PLANO DE MELHORIAS

### 5.1 Melhorias Visuais (UI)

| ID | Melhoria | Esforço | Impacto |
|----|----------|---------|---------|
| V1 | Empty states com ilustrações | Baixo | Alto |
| V2 | Skeleton loaders | Médio | Médio |
| V3 | Toast notifications estilizados | Baixo | Médio |
| V4 | Animações de transição | Baixo | Baixo |
| V5 | Modo claro refinado | Médio | Médio |
| V6 | Favicon e meta tags | Baixo | Alto |
| V7 | Dark/Light toggle visível | Baixo | Médio |

### 5.2 Melhorias de UX

| ID | Melhoria | Esforço | Impacto |
|----|----------|---------|---------|
| U1 | Onboarding tour (primeira visita) | Alto | Alto |
| U2 | Keyboard shortcuts funcionais | Médio | Médio |
| U3 | Drag & drop para upload | Baixo | Médio |
| U4 | Preview de arquivos antes de indexar | Médio | Alto |
| U5 | Progress bar para indexação | Médio | Alto |
| U6 | Histórico de comandos no chat | Médio | Médio |
| U7 | Favoritar/pinnar sessões | Baixo | Baixo |
| U8 | Export de conversas | Baixo | Médio |

### 5.3 Melhorias Técnicas

| ID | Melhoria | Esforço | Impacto |
|----|----------|---------|---------|
| T1 | reviewGate → backend | ~~Baixo~~ | ~~**Crítico**~~ ✅ FEITO |
| T2 | maskingEnabled implementação | ~~Médio~~ | ~~Alto~~ ✅ FEITO |
| T3 | RAG status real (documentCount) | ~~Baixo~~ | ~~Alto~~ ✅ FEITO |
| T4 | Remover "Boas Práticas" falsas | ~~Baixo~~ | ~~Alto~~ ✅ FEITO |
| T5 | E2E tests para UI | Alto | Alto |
| T6 | Acessibilidade (aria labels) | Médio | Médio |
| T7 | PWA support | Médio | Baixo |

### 5.4 Roadmap Sugerido

```
Sprint 1 (Crítico): ✅ CONCLUÍDO 2026-01-03
├── T1: reviewGate → backend ✅
├── T3: RAG status real ✅
├── T4: Boas práticas reais ✅
└── T2: maskingEnabled ✅

Sprint 2 (UX Foundation):
├── V1: Empty states
├── V6: Favicon/meta
└── U5: Progress bar indexação

Sprint 3 (Polish):
├── V2: Skeleton loaders
├── V3: Toast notifications
└── U1: Onboarding tour

Sprint 4 (Advanced):
├── T5: E2E tests UI
├── U2: Keyboard shortcuts
└── T6: Acessibilidade
```

---

## 6. PERGUNTA: LANDING PAGE SEPARADA?

### Contexto

> **"Seria viável criar uma landing page de apresentação separada, onde o usuário conhece o LegacyGuard antes de decidir criar conta?"**

### Análise

#### Prós de Landing Page Separada

| Benefício | Peso |
|-----------|------|
| **Conversão melhor** — usuário entende o produto antes de se comprometer | ⭐⭐⭐ |
| **SEO** — página estática indexa melhor | ⭐⭐⭐ |
| **Performance** — HTML estático, sem bundle React pesado | ⭐⭐ |
| **A/B testing** — testar mensagens diferentes | ⭐⭐ |
| **Marketing** — pode ter domínio separado (legacyguard.io vs app.legacyguard.io) | ⭐⭐ |
| **Separação de concerns** — site marketing vs. aplicação | ⭐⭐ |

#### Contras

| Desvantagem | Peso |
|-------------|------|
| **Dois deploys** — mais infraestrutura | ⭐ |
| **Consistência visual** — manter design system em dois projetos | ⭐⭐ |
| **Duplicação** — componentes compartilhados viram problema | ⭐ |

### Recomendação

**✅ SIM, é viável e recomendado.**

A estrutura ideal seria:

```
legacyguard.ai/           ← Landing page (Next.js static ou Astro)
├── /                     ← Hero, features, pricing, testimonials
├── /docs                 ← Documentação pública
├── /blog                 ← Conteúdo SEO
└── /login                ← Redirect para app

app.legacyguard.ai/       ← Aplicação (Next.js atual)
├── /                     ← Dashboard (requer auth)
├── /chat                 ← Interface principal
└── /settings             ← Configurações
```

### Implementação Sugerida

1. **Fase 1:** Criar landing page como rota `/welcome` no projeto atual
   - Sem autenticação necessária
   - Hero section explicando o produto
   - CTA "Começar Gratuitamente" → Login

2. **Fase 2:** Se tração justificar, separar em domínio próprio
   - `legacyguard.ai` → landing
   - `app.legacyguard.ai` → aplicação

3. **Conteúdo mínimo da landing:**
   - Hero com tagline clara
   - 3-4 features principais com ícones
   - Screenshot/GIF do produto em ação
   - Social proof (se disponível)
   - Pricing (se aplicável)
   - CTA primário visível

---

## 7. MÉTRICAS DE QUALIDADE

### 7.1 Performance (TODO: medir)

| Métrica | Target | Atual |
|---------|--------|-------|
| LCP (Largest Contentful Paint) | < 2.5s | ❓ |
| FID (First Input Delay) | < 100ms | ❓ |
| CLS (Cumulative Layout Shift) | < 0.1 | ❓ |
| TTI (Time to Interactive) | < 3.5s | ❓ |
| Bundle size (JS) | < 200KB | ❓ |

### 7.2 Acessibilidade (TODO: auditar)

| Critério | Status |
|----------|--------|
| Contraste de cores | ❓ |
| Navegação por teclado | ❓ |
| Screen reader support | ❓ |
| Focus indicators | ❓ |
| Alt text em imagens | ❓ |

---

## 8. CHANGELOG

| Data | Versão | Mudanças |
|------|--------|----------|
| 2026-01-03 | 1.0 | Documento inicial |
| 2026-01-03 | 1.1 | P0+P1 corrigidos: reviewGate→backend, maskingEnabled, RAG documentCount, Boas Práticas reais |

---

## 9. PRÓXIMAS AÇÕES

1. **Imediato:** Corrigir `reviewGate` (P0)
2. **Esta semana:** Implementar T3, T4
3. **Este mês:** Criar protótipo de landing page separada
4. **Contínuo:** Atualizar este documento após cada mudança no frontend

---

*Documento mantido por: LegacyGuard Team*  
*Última atualização automática: 2026-01-03*
