# 🛡️ Guia do LegacyGuard para Desenvolvedores

Este documento serve como referência rápida para entender o sistema LegacyGuard.

## O Que É o LegacyGuard?

**LegacyGuard** é uma plataforma de orquestração de agentes AI para manutenção segura de código legado.

### Problema que Resolve

Manter código legado é arriscado:
- Falta documentação
- Dependências desatualizadas
- Medo de quebrar algo
- Testes insuficientes

### Solução

LegacyGuard combina:
1. **Análise Inteligente** - Entende o código mesmo sem documentação
2. **Agentes Especializados** - Cada tarefa tem um especialista
3. **Segurança Rigorosa** - Sandbox, aprovação humana, auditoria
4. **Reprodução de Bugs** - Twin Builder recria problemas em ambiente controlado

---

## Modos de Uso

### 💬 Chat Livre (LegacyAssist)
**Quando usar:** Dúvidas rápidas, orientação, explorar opções

```
"Como faço para migrar essa função de callback para async/await?"
"Qual a melhor estratégia para atualizar o React de 16 para 18?"
```

### 🎯 Modo Guiado (Guardian Flow)
**Quando usar:** Não sabe por onde começar, quer passo a passo

1. Descreva o problema
2. Sistema sugere pesquisas (RAG/Web)
3. Brainstorm de opções
4. Validação antes de agir
5. Aprovação humana
6. Execução controlada

### 🎭 Orquestração Multi-Agente
**Quando usar:** Tarefas complexas, refatorações, migrações

```
"Preciso refatorar todo o módulo de autenticação para usar JWT"
"Quero aplicar um patch que corrige a vulnerabilidade CVE-2024-XXX"
```

---

## Agentes Disponíveis

| Agente | Função | Quando Usar |
|--------|--------|-------------|
| **LegacyAssist** | Chat conversacional | Dúvidas, orientação |
| **Advisor** | Análise de código | Avaliar riscos, encontrar problemas |
| **Orchestrator** | Coordenação | Tarefas multi-etapa |
| **Planner** | Criar planos | Quebrar tarefas complexas |
| **Twin Builder** | Reproduzir bugs | Debug de incidentes |
| **Reviewer** | Code review | Validar mudanças |
| **Operator** | Git operations | Branches, patches, PRs |
| **Executor** | Ações finais | Merge, deploy |

---

## Fluxo Típico de Trabalho

### Para Dúvidas Simples
```
Usuário → LegacyAssist → Resposta
```

### Para Análise
```
Usuário → LegacyAssist → Advisor → Relatório
```

### Para Refatoração
```
Usuário → Orchestrator → Planner → Advisor → Operator → Reviewer → Executor
                                      ↓
                            (aprovação humana se risco alto)
```

### Para Bugs/Incidentes
```
Usuário → Orchestrator → Twin Builder → Advisor → Operator → Reviewer → Executor
              ↓
        (reproduz em sandbox primeiro)
```

---

## Segurança

### Níveis de Risco
- **Baixo**: Apenas leitura/análise
- **Médio**: Cria branches, gera patches
- **Alto**: Aplica patches, modifica código
- **Crítico**: Merge, deploy, rollback

### Controles
1. **RBAC**: Controle de acesso por role
2. **Rate Limiting**: Proteção contra abuso
3. **Sandbox Docker**: Execução isolada
4. **Aprovação Humana**: Obrigatória para risco alto/crítico
5. **Auditoria**: Log de todas as operações

---

## RAG (Retrieval-Augmented Generation)

### O Que É
Sistema que indexa seu repositório para dar contexto às respostas.

### Status
- **Pendente**: Repositório não indexado
- **Indexando**: Em processo
- **Indexado**: Pronto para uso
- **Erro**: Falha na indexação

### Benefícios
- Respostas mais precisas sobre seu código
- Entende estrutura do projeto
- Encontra arquivos relacionados automaticamente

---

## Troubleshooting

### "O LegacyAssist parece perdido"
1. Verifique se o RAG está indexado
2. Dê contexto: "Estou trabalhando no módulo X do repositório Y"
3. Seja específico na pergunta

### "Não consigo fazer login"
1. Verifique as credenciais do GitHub OAuth
2. Confirme que a callback URL está correta
3. Tente limpar cookies e tentar novamente

### "O Orchestrator não executa"
1. Precisa de aprovação humana para risco alto
2. Verifique se o sandbox está configurado
3. Confira se há token do GitHub para PRs

---

## Comandos Úteis

```bash
# Desenvolvimento
pnpm dev

# Worker (para orquestração)
pnpm worker

# Testes
pnpm test

# Indexar repositório (RAG)
pnpm run index -- --repo /path/to/repo
```

---

## Estrutura de Diretórios

```
src/
├── agents/          # Agentes AI (advisor, planner, etc.)
├── analyzers/       # Analisadores (profiler, classifier)
├── app/             # Next.js App Router
│   ├── api/         # APIs REST
│   └── components/  # React components
├── lib/             # Utilitários compartilhados
│   ├── system-context.ts  # Contexto do sistema para prompts
│   ├── audit.ts           # Sistema de auditoria
│   └── sandbox.ts         # Sandbox Docker
└── types/           # TypeScript types
```

---

## Perguntas Frequentes

**P: Posso usar sem GitHub?**
R: Sim, mas perde funcionalidades de PR/merge.

**P: Funciona offline?**
R: Parcialmente. RAG local funciona, mas LLMs precisam de API.

**P: É seguro para código proprietário?**
R: Sim. Sandbox isolado, logs auditáveis, sem vazamento de dados.

**P: Quais linguagens suporta?**
R: TypeScript, JavaScript, Python, e outras via análise genérica.
