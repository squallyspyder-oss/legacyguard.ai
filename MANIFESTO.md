# 🛑 MANIFESTO DO LEGACYGUARD

> **Definition of REAL (não "Done")**

LegacyGuard não é um projeto experimental.  
É uma plataforma que promete **confiança técnica**, **controle humano** e **segurança real**.

Qualquer coisa abaixo disso é autoengano.

Este manifesto define o que é **REAL**, não o que "parece pronto".

---

## 1️⃣ UMA FEATURE NÃO EXISTE SE NÃO PODE FALHAR

Se algo:
- Não tem falha prevista
- Não tem erro tratado
- Não tem cenário adverso mapeado

**Então não existe.**  
Existe apenas código otimista, que falha em produção.

> Se não sabemos como quebra, não entendemos o sistema.

---

## 2️⃣ UMA FEATURE NÃO EXISTE SE NÃO PODE SER AUDITADA

Toda ação relevante deve responder, **sem exceção**:

| Pergunta | Obrigatória |
|----------|-------------|
| Quem iniciou? | ✅ |
| Quando? | ✅ |
| Com qual contexto? | ✅ |
| Qual agente executou? | ✅ |
| Qual decisão foi tomada? | ✅ |
| Qual evidência sustenta essa decisão? | ✅ |

Se uma ação não deixa rastro, ela é **inaceitável**.

> **Auditoria não é opcional.**  
> **Auditoria é o produto.**

---

## 3️⃣ UMA FEATURE NÃO EXISTE SE NÃO PODE SER INTERROMPIDA

**Human-in-the-loop não é UX, é bloqueio estrutural.**

Se uma ação crítica:
- Pode continuar sem aprovação
- Pode ser disparada via API sem verificação
- Pode ser corrida por race condition
- Pode ser "simulada" sem enforcement

**Então o controle humano é falso.**

> Se o humano não pode parar, ele não controla.

---

## 4️⃣ UMA FEATURE NÃO EXISTE SE NÃO PODE SER REVERTIDA

Rollback prometido e rollback executável **não são a mesma coisa**.

**Rollback REAL exige:**
- ✅ Estado versionado
- ✅ Ação reversível
- ✅ Evidência de sucesso ou falha
- ✅ Auditoria da reversão

**Se o rollback depende de:**
- ❌ Boa vontade
- ❌ Script manual
- ❌ "Depois a gente resolve"

**Então é mentira técnica.**

---

## 5️⃣ AGENTES NÃO SÃO INTELIGENTES — SÃO PERIGOSOS

**Nenhum agente é confiável por padrão.**

Todo agente deve:
- Ter escopo explícito
- Ter entrada validada
- Ter saída validada
- Ter limites claros
- Ter falhas previstas

Qualquer lógica que dependa de:
> *"O modelo vai entender"*

**É falha de engenharia, não IA avançada.**

---

## 6️⃣ ORQUESTRAÇÃO SEM VERIFICAÇÃO É TEATRO

Multi-agente sem:
- Ordem determinística
- Estados explícitos
- Dependências claras
- Falhas propagadas

**É apenas concorrência caótica com marketing.**

> Se não conseguimos explicar a execução passo a passo,  
> então não sabemos o que o sistema está fazendo.

---

## 7️⃣ SANDBOX QUE NÃO ISOLA É RISCO LEGAL

**Sandbox NÃO é:**
- ❌ "Rodar em Docker"
- ❌ "Limitar timeout"

**Sandbox REAL exige:**
- ✅ Isolamento verificável
- ✅ Limite de recursos enforceable
- ✅ Zero vazamento de secrets
- ✅ Evidência de execução

> Se não podemos provar isolamento,  
> não temos sandbox.

---

## 8️⃣ README É CONTRATO, NÃO PROMESSA

Tudo que está no README:
- **Deve existir em código**
- **Deve ser enforceable**
- **Deve ser verificável**

Qualquer divergência entre README e execução é:

### 🔴 BUG CRÍTICO DE CONFIANÇA

> Documentação que mente é pior que bug.

---

## 9️⃣ PROGRESSO SEM VERIFICAÇÃO É REGRESSÃO DISFARÇADA

Adicionar features sem:
- Teste de falha
- Validação de fluxo completo
- Revisão sistêmica

**É andar rápido na direção errada.**

> Velocidade não importa.  
> **Direção e controle importam.**

---

## 🔟 REGRA FINAL — VERDADE ACIMA DO EGO

Se algo:
- Está incompleto
- Está frágil
- Está mal desenhado
- Está "quase lá"

**Isso deve ser dito explicitamente.**

> Código bonito não salva produto.  
> **Arquitetura honesta, sim.**

---

## 🧨 DECLARAÇÃO FINAL

**LegacyGuard não existe para impressionar.**  
**Existe para não quebrar quando importa.**

Qualquer decisão que sacrifique:
- Controle
- Auditoria
- Segurança
- Clareza sistêmica

Em troca de velocidade ou conforto  
**é rejeitada por princípio.**

---

## 📜 Assinatura Implícita

> Todo humano ou agente que contribui com este repositório  
> **aceita este manifesto antes de escrever uma linha de código.**

---

*Última atualização: 2026-01-03*
