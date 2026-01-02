# 🚀 TUTORIAL: Deploy Completo do LegacyGuard

Guia passo a passo para configurar o LegacyGuard em produção.

---

## 📋 Índice

1. [Criar Contas](#1-criar-contas)
2. [Configurar Neon (PostgreSQL)](#2-configurar-neon-postgresql)
3. [Configurar Upstash (Redis)](#3-configurar-upstash-redis-opcional)
4. [Configurar GitHub OAuth](#4-configurar-github-oauth)
5. [Configurar OpenAI](#5-configurar-openai)
6. [Deploy no Render](#6-deploy-no-render)
7. [Verificar Deploy](#7-verificar-deploy)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Criar Contas

Crie contas gratuitas nos serviços:

| Serviço | Link | Para quê |
|---------|------|----------|
| **Render** | [render.com](https://render.com) | Hospedagem da aplicação |
| **Neon** | [neon.tech](https://neon.tech) | Banco de dados PostgreSQL |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | API de IA (GPT-4) |
| **GitHub** | [github.com](https://github.com) | OAuth + Repositório |
| **Upstash** (opcional) | [upstash.com](https://upstash.com) | Redis para filas |

---

## 2. Configurar Neon (PostgreSQL)

### 2.1 Criar Projeto

1. Acesse [console.neon.tech](https://console.neon.tech)
2. Clique em **New Project**
3. Configure:
   - **Name**: `legacyguard`
   - **Region**: Escolha a mais próxima (ex: `US East`)
4. Clique em **Create Project**

### 2.2 Copiar Connection String

1. No dashboard do projeto, vá em **Connection Details**
2. Selecione **Connection string**
3. Copie a URL (formato):
   ```
   postgresql://neondb_owner:xxxx@ep-xxx-xxx-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

> ⚠️ **Guarde essa URL!** Você vai usar no Render.

### 2.3 Habilitar pgvector

1. No Neon, vá em **SQL Editor**
2. Execute:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

### 2.4 Criar Tabelas

Execute no SQL Editor:

```sql
-- Tabela de auditoria
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT,
  action TEXT NOT NULL,
  agent TEXT,
  input JSONB,
  output JSONB,
  cost_usd NUMERIC(10, 6),
  signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_session ON audit_logs(session_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);

-- Tabela de quotas
CREATE TABLE IF NOT EXISTS user_quotas (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  tokens_used BIGINT DEFAULT 0,
  usd_used NUMERIC(10, 6) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- Tabela de embeddings (RAG)
CREATE TABLE IF NOT EXISTS code_embeddings (
  id SERIAL PRIMARY KEY,
  repo_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  chunk_hash TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo_path, file_path, chunk_hash)
);

-- Índice para busca vetorial
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
ON code_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### 2.5 (Automático) Integração GitHub

Quando você cria o projeto Neon, ele pergunta se quer conectar ao GitHub.
Se conectar, o Neon cria automaticamente:
- `NEON_API_KEY` como Secret no GitHub
- `NEON_PROJECT_ID` como Variable no GitHub
- Workflow para criar branches de preview em PRs

---

## 3. Configurar Upstash (Redis) - Opcional

O Redis é usado para filas de tarefas e rate limiting. Opcional para começar.

### 3.1 Criar Database

1. Acesse [console.upstash.com](https://console.upstash.com)
2. Clique em **Create Database**
3. Configure:
   - **Name**: `legacyguard`
   - **Region**: Escolha a mais próxima
   - **TLS**: Enabled ✅
4. Clique em **Create**

### 3.2 Copiar Connection String

1. Na página do database, copie **UPSTASH_REDIS_REST_URL** ou a URL Redis:
   ```
   rediss://default:xxxx@xxx-xxx-12345.upstash.io:6379
   ```

---

## 4. Configurar GitHub OAuth

Para autenticação de usuários via GitHub.

### 4.1 Criar OAuth App

1. Acesse [github.com/settings/developers](https://github.com/settings/developers)
2. Clique em **OAuth Apps** → **New OAuth App**
3. Configure:

| Campo | Valor |
|-------|-------|
| **Application name** | `LegacyGuard` |
| **Homepage URL** | `https://legacyguard-web.onrender.com` (ou sua URL) |
| **Authorization callback URL** | `https://legacyguard-web.onrender.com/api/auth/callback/github` |

4. Clique em **Register application**

### 4.2 Copiar Credenciais

1. Copie o **Client ID**
2. Clique em **Generate a new client secret**
3. Copie o **Client Secret**

> ⚠️ **Guarde essas credenciais!** O secret só aparece uma vez.

---

## 5. Configurar OpenAI

### 5.1 Criar API Key

1. Acesse [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Clique em **Create new secret key**
3. Dê um nome: `LegacyGuard`
4. Copie a chave (começa com `sk-`)

### 5.2 Adicionar Créditos

1. Vá em **Settings** → **Billing**
2. Adicione um método de pagamento
3. Adicione créditos (mínimo $5 para começar)

> ⚠️ Sem créditos, a API retorna erro 429.

---

## 6. Deploy no Render

### 6.1 Criar Web Service

1. Acesse [dashboard.render.com](https://dashboard.render.com)
2. Clique em **New +** → **Web Service**
3. Conecte seu repositório GitHub: `squallyspyder-oss/legacyguard.ai`
4. Configure:

| Campo | Valor |
|-------|-------|
| **Name** | `legacyguard-web` |
| **Region** | `Oregon (US West)` ou mais próximo |
| **Branch** | `main` |
| **Runtime** | `Docker` |
| **Dockerfile Path** | `./Dockerfile` |
| **Instance Type** | `Starter` ($7/mês) ou `Free` para teste |

### 6.2 Configurar Variáveis de Ambiente

No Render, vá em **Environment** e adicione:

#### Obrigatórias:

| Key | Value | Descrição |
|-----|-------|-----------|
| `NODE_ENV` | `production` | Ambiente |
| `OPENAI_API_KEY` | `sk-...` | Sua chave OpenAI |
| `NEXTAUTH_SECRET` | (gere abaixo) | Chave de sessão |
| `NEXTAUTH_URL` | `https://legacyguard-web.onrender.com` | URL do app |
| `GITHUB_ID` | `Ov23li...` | Client ID do OAuth |
| `GITHUB_SECRET` | `xxxx...` | Client Secret do OAuth |

**Gerar NEXTAUTH_SECRET:**
```bash
openssl rand -base64 32
```

#### Banco de Dados:

| Key | Value | Descrição |
|-----|-------|-----------|
| `AUDIT_DB_URL` | `postgresql://...@...neon.tech/...` | URL do Neon |
| `PGVECTOR_URL` | (mesma URL do Neon) | Para embeddings |

#### Opcionais:

| Key | Value | Descrição |
|-----|-------|-----------|
| `REDIS_URL` | `rediss://...@...upstash.io:6379` | URL do Upstash |
| `OPENAI_CHEAP_MODEL` | `gpt-4o-mini` | Modelo rápido |
| `OPENAI_DEEP_MODEL` | `gpt-4o` | Modelo completo |
| `AUDIT_SIGNING_KEY` | (qualquer string) | Assinatura de logs |

### 6.3 Deploy

1. Clique em **Create Web Service**
2. Aguarde o build (~5-10 minutos na primeira vez)
3. Quando aparecer **Live**, acesse a URL

---

## 7. Verificar Deploy

### 7.1 Testar a Aplicação

1. Acesse: `https://legacyguard-web.onrender.com`
2. Clique em **Entrar com GitHub**
3. Autorize o app
4. Envie uma mensagem de teste no chat

### 7.2 Verificar API

```bash
# Health check
curl https://legacyguard-web.onrender.com/api/config

# Resposta esperada:
# {"status":"ok","features":{...}}
```

### 7.3 Verificar Logs

No Render Dashboard → seu serviço → **Logs**

Procure por:
- ✅ `Ready on port 3000`
- ✅ `[AUDIT] Connected to PostgreSQL`
- ⚠️ Qualquer erro em vermelho

---

## 8. Troubleshooting

### Erro: `ENOTFOUND host`

**Causa**: Variável de banco de dados com valor placeholder.

**Solução**: 
1. Verifique `AUDIT_DB_URL` e `PGVECTOR_URL` no Render
2. Devem ter a URL real do Neon, não `postgresql://user:pass@host:5432/...`
3. Faça **Manual Deploy** após corrigir

---

### Erro: `Missing OPENAI_API_KEY`

**Solução**: Adicione `OPENAI_API_KEY` nas variáveis do Render.

---

### Erro: `OAuth callback error`

**Causa**: URL de callback incorreta no GitHub OAuth.

**Solução**: 
1. Vá em GitHub → Settings → Developer settings → OAuth Apps
2. Verifique se **Authorization callback URL** é exatamente:
   ```
   https://legacyguard-web.onrender.com/api/auth/callback/github
   ```

---

### Erro: `Database connection failed`

**Soluções**:
1. Verifique se a URL do Neon tem `?sslmode=require` no final
2. Verifique se o IP do Render não está bloqueado (Neon permite todos por padrão)
3. Teste a conexão no Neon SQL Editor

---

### Build demora muito / falha

**Soluções**:
1. Primeira build demora ~10min (normal)
2. Se falhar com `ENOMEM`, use instância maior
3. Verifique os logs de build no Render

---

## 📋 Checklist Final

- [ ] Conta Neon criada
- [ ] Projeto Neon com pgvector habilitado
- [ ] Tabelas criadas no Neon
- [ ] Connection string do Neon copiada
- [ ] Conta OpenAI com créditos
- [ ] API Key OpenAI copiada
- [ ] GitHub OAuth App criado
- [ ] Client ID e Secret copiados
- [ ] Render Web Service criado
- [ ] Todas variáveis de ambiente configuradas
- [ ] Deploy concluído com sucesso
- [ ] Login via GitHub funcionando
- [ ] Chat respondendo

---

## 🔗 Links Úteis

| Serviço | Dashboard | Docs |
|---------|-----------|------|
| **Render** | [dashboard.render.com](https://dashboard.render.com) | [render.com/docs](https://render.com/docs) |
| **Neon** | [console.neon.tech](https://console.neon.tech) | [neon.tech/docs](https://neon.tech/docs) |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | [platform.openai.com/docs](https://platform.openai.com/docs) |
| **Upstash** | [console.upstash.com](https://console.upstash.com) | [upstash.com/docs](https://upstash.com/docs) |
| **GitHub OAuth** | [github.com/settings/developers](https://github.com/settings/developers) | [docs.github.com/apps/oauth-apps](https://docs.github.com/en/apps/oauth-apps) |

---

**Pronto!** 🎉 Seu LegacyGuard está rodando em produção.

Se tiver problemas, verifique os logs no Render e revise este tutorial.
