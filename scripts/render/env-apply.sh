#!/usr/bin/env bash
set -euo pipefail

echo "Script de template para aplicar variáveis de ambiente no Render (CLI)."

if ! command -v render >/dev/null 2>&1; then
  echo "Instale o Render CLI: https://github.com/render-examples/render-cli ou 'npm i -g @render/cli'" >&2
  exit 1
fi

# Nomes dos serviços (ajuste se você alterou em render.yaml)
SERVICE_WEB=legacyguard-web
SERVICE_WORKER=legacyguard-worker

# Lista de variáveis recomendadas (exporte antes de rodar ou edite o arquivo)
REQUIRED=(OPENAI_API_KEY PGVECTOR_URL REDIS_URL NEXTAUTH_SECRET GITHUB_ID GITHUB_SECRET NEXTAUTH_URL)

for v in "${REQUIRED[@]}"; do
  if [ -z "${!v-}" ]; then
    echo "Atenção: variável $v não definida. Você pode exportá-la antes de executar este script." >&2
  fi
done

echo "Criando/atualizando serviços (comandos idempotentes; falhas são ignoradas)."
render services create --name "$SERVICE_WEB" --env node --region oregon --branch main --build-command "npm ci && npm run build" --start-command "npm run start" || true
render services create --name "$SERVICE_WORKER" --env docker --region oregon --branch main --dockerfile Dockerfile.worker || true

# Aplica variáveis para web e worker quando definidas
envs=(OPENAI_API_KEY OPENAI_CHEAP_MODEL OPENAI_DEEP_MODEL PGVECTOR_URL AUDIT_DB_URL AUDIT_SIGNING_KEY REDIS_URL REDIS_TLS_URL NEXTAUTH_SECRET GITHUB_ID GITHUB_SECRET NEXTAUTH_URL NODE_ENV LEGACYGUARD_REPO_PATH LEGACYGUARD_FORCE_DOCKER QUOTA_CIRCUIT_THRESHOLD_USD QUOTA_CIRCUIT_PAUSE_MS)

for k in "${envs[@]}"; do
  v="${!k-}"
  if [ -n "$v" ]; then
    echo "Setting $k on $SERVICE_WEB"
    render services env set "$SERVICE_WEB" "$k" "$v" || true
    echo "Setting $k on $SERVICE_WORKER"
    render services env set "$SERVICE_WORKER" "$k" "$v" || true
  fi
done

echo "Pronto. Revise o painel do Render e execute um deploy manual se necessário."

echo "Nota: removi exports sensíveis deste script para evitar comitar segredos no repositório."
echo "Crie um arquivo local '.env.render' (não comite) com suas variáveis e adicione-o ao .gitignore."

if [ -f ".env.render" ]; then
  echo "Carregando .env.render (exportando variáveis)..."
  set -o allexport
  # shellcheck disable=SC1090
  source .env.render
  set +o allexport
else
  echo "Arquivo .env.render não encontrado. Exporte as variáveis no shell antes de rodar este script." >&2
  echo "Exemplo: export OPENAI_API_KEY=\"sk-...\"" >&2
fi

echo "Agora aplicando variáveis (se definidas) ao Render..."
