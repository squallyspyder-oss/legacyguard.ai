#!/bin/bash
# ============================================
# Script para configurar secrets no AWS Secrets Manager
# ============================================
#
# Uso:
#   ./setup-secrets.sh
#
# Pré-requisitos:
#   - AWS CLI configurado (aws configure)
#   - Arquivo .env.local com os valores corretos
#   - Permissão para acessar Secrets Manager

set -e

SECRET_NAME="legacyguard/app-secrets"
REGION="${AWS_REGION:-sa-east-1}"

echo "🔐 Configurando secrets no AWS Secrets Manager..."
echo "   Secret: $SECRET_NAME"
echo "   Region: $REGION"
echo ""

# Verificar se .env.local existe
if [ ! -f ".env.local" ]; then
    echo "❌ Arquivo .env.local não encontrado!"
    echo "   Copie .env.example para .env.local e preencha os valores."
    exit 1
fi

# Carregar variáveis do .env.local
source .env.local 2>/dev/null || true

# Validar variáveis obrigatórias
REQUIRED_VARS=(
    "OPENAI_API_KEY"
    "GITHUB_ID"
    "GITHUB_SECRET"
    "NEXTAUTH_SECRET"
    "AUDIT_DB_URL"
    "PGVECTOR_URL"
    "REDIS_URL"
)

echo "📋 Verificando variáveis obrigatórias..."
MISSING=0
for VAR in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!VAR}" ]; then
        echo "   ❌ $VAR não definida"
        MISSING=1
    else
        echo "   ✅ $VAR"
    fi
done

if [ $MISSING -eq 1 ]; then
    echo ""
    echo "❌ Variáveis obrigatórias faltando. Configure em .env.local"
    exit 1
fi

# Construir JSON dos secrets
SECRET_JSON=$(cat <<EOF
{
    "OPENAI_API_KEY": "${OPENAI_API_KEY}",
    "GITHUB_ID": "${GITHUB_ID}",
    "GITHUB_SECRET": "${GITHUB_SECRET}",
    "NEXTAUTH_SECRET": "${NEXTAUTH_SECRET}",
    "AUDIT_SIGNING_KEY": "${AUDIT_SIGNING_KEY:-$(openssl rand -hex 16)}",
    "AUDIT_DB_URL": "${AUDIT_DB_URL}",
    "PGVECTOR_URL": "${PGVECTOR_URL}",
    "REDIS_URL": "${REDIS_URL}",
    "REDIS_TLS_URL": "${REDIS_TLS_URL:-$REDIS_URL}"
}
EOF
)

echo ""
echo "🚀 Atualizando secrets no AWS Secrets Manager..."

# Tentar atualizar, ou criar se não existir
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" --region "$REGION" >/dev/null 2>&1; then
    echo "   Atualizando secret existente..."
    aws secretsmanager put-secret-value \
        --secret-id "$SECRET_NAME" \
        --secret-string "$SECRET_JSON" \
        --region "$REGION"
else
    echo "   Criando novo secret..."
    aws secretsmanager create-secret \
        --name "$SECRET_NAME" \
        --secret-string "$SECRET_JSON" \
        --region "$REGION"
fi

echo ""
echo "✅ Secrets configurados com sucesso!"
echo ""
echo "📝 Próximos passos:"
echo "   1. Verifique os secrets: aws secretsmanager get-secret-value --secret-id $SECRET_NAME --region $REGION"
echo "   2. Execute terraform apply para criar a infraestrutura"
echo "   3. Faça push para main para disparar o deploy"
