# Deploy e provisionamento (Render + serviços externos)

Este documento resume como provisionar os serviços que o `legacyguard` usa e como fazer deploy no Render.

## 1) Serviços no Render

- O arquivo `render.yaml` já descreve dois serviços: **legacyguard-web** (Next.js) e **legacyguard-worker** (processamento em background). Basta conectar o repositório no dashboard do Render que o manifest será detectado.
- Se preferir criar manualmente via CLI, um exemplo:

```bash
render services create --name legacyguard-web --env node --region oregon --branch main --build-command "npm ci && npm run build" --start-command "npm run start"
render services create --name legacyguard-worker --env docker --region oregon --branch main --dockerfile Dockerfile.worker
```

## 2) Serviços externos

- **Postgres (audit + RAG/pgvector)**: usar Neon ou Supabase com extensão `pgvector`. Rode `scripts/pgvector_bootstrap.sql` se precisar criar o schema base.
- **Redis (fila/streams)**: Upstash, Redis Cloud ou AWS Elasticache. Exemplo de URL: `redis://:password@host:6379`.

## 3) Variáveis de ambiente

Configure pelo painel do Render ou use `scripts/render/env-apply.sh`. Principais chaves:
- `OPENAI_API_KEY`, `OPENAI_CHEAP_MODEL`, `OPENAI_DEEP_MODEL`
- `REDIS_URL` ou `REDIS_TLS_URL`
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GITHUB_ID`, `GITHUB_SECRET`
- `AUDIT_DB_URL`, `PGVECTOR_URL`, `AUDIT_SIGNING_KEY`
- Opcional: `LEGACYGUARD_REPO_PATH`, `LEGACYGUARD_SANDBOX_*`

## 4) Deploys e operações

- Conecte o repositório no Render; cada push em `main` dispara deploy automático conforme o manifest.
- CLI útil:

```bash
render services list
render services env list legacyguard-web
render services env list legacyguard-worker
render logs legacyguard-web
render logs legacyguard-worker
```

## 5) Testes locais (antes do deploy)

Web:

```bash
npm ci
npm run build
npm run start
# http://localhost:3000
```

Worker:

```bash
npm run build:worker
npm run start:worker
```

Boas práticas: habilite backups/monitoramento em Postgres/Redis, mantenha segredos apenas em envs gerenciadas e revogue tokens antigos.

```bash
render services list
render services env list legacyguard-web
render services env list legacyguard-worker
render logs legacyguard-web
render logs legacyguard-worker
```

<<<<<<< HEAD
8) Testes locais (antes do deploy)

Web:
```bash
npm ci
npm run build
npm run start
# verificar http://localhost:3000
```

Worker:
```bash
npm run build:worker
npm run start:worker
```

Segurança: não compartilhe chaves em chats. Use `render login` para autenticar interativamente ou `RENDER_API_KEY` em CI.
=======
## 7) Arquivos de configuração

- `render.yaml` — Configuração completa do deploy no Render
- `.env.example` — Template de variáveis de ambiente
- `Dockerfile.worker` — Container para executar o worker
>>>>>>> 323c965a87f923f1bbce3407e4f3272ac9edb52d
