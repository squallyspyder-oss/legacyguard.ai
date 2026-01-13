# Deploy no Render — LegacyGuard

Este README guia o deploy do LegacyGuard no Render (UI e CLI) e explica como aplicar variáveis de ambiente com segurança.

Avisos importantes
- NÃO comite segredos no repositório. Use o arquivo local `.env.render` (já adicionado ao `.gitignore`).
- Revogue e rotacione quaisquer chaves que foram expostas antes de prosseguir.

1) Preparação (Recomendado)

- Crie um banco Postgres com `pgvector` (Neon ou Supabase recomendado). Anote a URL de conexão como `PGVECTOR_URL`.
- Provisione um Redis gerenciado (Render, Upstash, RedisLabs). Anote `REDIS_URL` (use `rediss://` se TLS).
- Configure um OAuth App do GitHub e obtenha `GITHUB_ID` e `GITHUB_SECRET`.

2) Criar arquivo local de ambiente

No seu ambiente local, crie um arquivo `.env.render` (NUNCA comite):

```bash
OPENAI_API_KEY="sk-..."
SUPABASE_URL="https://project.supabase.co"
SUPABASE_PUBLIC_KEY="sb_publishable_..."
SUPABASE_SERVICE_KEY="sb_secret_..."
PGVECTOR_URL="postgres://user:pass@host:5432/legacyguard"
REDIS_URL="redis://:PASSWORD@host:PORT"
NEXTAUTH_SECRET="uma-senha-complexa"
GITHUB_ID="..."
GITHUB_SECRET="..."
NODE_ENV=production
```

3) Usando o painel do Render (UI)

- No Render, crie um Web Service:
  - Nome: `legacyguard-web`
  - Tipo: `Node` (ou `Auto`)
  - Branch: `main`
  - Build Command: `npm ci && npm run build`
  - Start Command: `npm run start`

- Crie um Background Worker:
  - Nome: `legacyguard-worker`
  - Tipo: `Docker`
  - Dockerfile: `Dockerfile.worker`
  - Branch: `main`

- (Opcional) Use o `render.yaml` presente no repositório para provisionar via CLI/infra.

4) Aplicar variáveis via CLI (script incluso)

O repositório inclui `scripts/render/env-apply.sh` que aplica variáveis para `legacyguard-web` e `legacyguard-worker` via Render CLI.

- Torne o script executável e rode localmente (após criar `.env.render` ou exportar variáveis):

```bash
chmod +x scripts/render/env-apply.sh
./scripts/render/env-apply.sh
```

O script tentará criar os serviços se não existirem e aplicará as variáveis exportadas no ambiente ou no `.env.render`.

5) Verificações pós-deploy

- No painel do Render: check logs dos serviços `legacyguard-web` e `legacyguard-worker`.
- Teste endpoints básicos: `/api/agents`, `/api/index` e rota de autenticação.
- Verifique conexões com Postgres/pgvector e Redis (logs + healthchecks).

6) Boas práticas

- Habilite deploy automático no branch `main` apenas quando estiver confortável com deploys contínuos.
- Configure alertas (Slack/Email) no Render para falhas de deploy ou erros críticos.
- Use um serviço de segredos ou provider de IAM para rotacionar chaves automaticamente quando possível.

Se quiser, eu posso: (A) rodar o script agora (local) e depois checar logs, ou (B) aguardar você criar `.env.render` local e me avisar para executar. 
