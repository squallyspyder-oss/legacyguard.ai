# Deploy AWS - LegacyGuard

Guia completo para deploy do LegacyGuard na AWS usando ECS Fargate.

## 📋 Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                           AWS Cloud (sa-east-1)                      │
│                                                                      │
│  ┌──────────────┐     ┌──────────────────────────────────────────┐  │
│  │   Route 53   │────▶│            Application Load Balancer      │  │
│  │  (opcional)  │     │              (HTTPS/HTTP)                 │  │
│  └──────────────┘     └─────────────────┬────────────────────────┘  │
│                                         │                            │
│                       ┌─────────────────┴─────────────────┐         │
│                       │         ECS Cluster               │         │
│                       │  ┌─────────────┐ ┌─────────────┐  │         │
│                       │  │   App       │ │   Worker    │  │         │
│                       │  │  (Fargate)  │ │  (Fargate)  │  │         │
│                       │  │  2 tasks    │ │  1 task     │  │         │
│                       │  └──────┬──────┘ └──────┬──────┘  │         │
│                       └─────────┼───────────────┼─────────┘         │
│                                 │               │                    │
│  ┌──────────────────────────────┼───────────────┼──────────────────┐│
│  │                    VPC (Private Subnets)     │                  ││
│  │                              │               │                  ││
│  │  ┌───────────────┐          │               │                  ││
│  │  │ NAT Gateway   │◀─────────┴───────────────┘                  ││
│  │  └───────┬───────┘                                              ││
│  └──────────┼──────────────────────────────────────────────────────┘│
│             │                                                        │
└─────────────┼────────────────────────────────────────────────────────┘
              │
    ┌─────────┴─────────┐
    │   External APIs   │
    │  ┌─────────────┐  │
    │  │    Neon     │  │  PostgreSQL (sa-east-1)
    │  │  (pgvector) │  │
    │  └─────────────┘  │
    │  ┌─────────────┐  │
    │  │   Upstash   │  │  Redis
    │  └─────────────┘  │
    │  ┌─────────────┐  │
    │  │   OpenAI    │  │  LLM API
    │  └─────────────┘  │
    │  ┌─────────────┐  │
    │  │   GitHub    │  │  OAuth + Webhooks
    │  └─────────────┘  │
    └───────────────────┘
```

## 🚀 Pré-requisitos

1. **Conta AWS** com permissões para:
   - ECS, ECR, ALB, VPC, IAM, Secrets Manager, CloudWatch

2. **AWS CLI** configurado:
   ```bash
   aws configure
   # AWS Access Key ID: sua-key
   # AWS Secret Access Key: sua-secret
   # Default region: sa-east-1
   ```

3. **Terraform** >= 1.5.0:
   ```bash
   brew install terraform  # macOS
   # ou
   sudo apt install terraform  # Ubuntu
   ```

4. **Secrets do GitHub** configurados:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`

## 📦 Deploy Inicial

### 1. Configurar Secrets na AWS

```bash
cd infra/aws

# Editar .env.local com valores de produção
cp ../../.env.example ../../.env.local
nano ../../.env.local

# Upload para AWS Secrets Manager
chmod +x setup-secrets.sh
./setup-secrets.sh
```

### 2. Provisionar Infraestrutura

```bash
cd infra/aws

# Inicializar Terraform
terraform init

# Revisar plano
terraform plan -var-file="prod.tfvars"

# Aplicar (criar recursos)
terraform apply -var-file="prod.tfvars"
```

Outputs importantes:
- `alb_dns_name`: URL do Load Balancer
- `ecr_app_repository_url`: URL do ECR para app
- `ecr_worker_repository_url`: URL do ECR para worker

### 3. Build e Push Inicial das Imagens

```bash
# Login no ECR
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.sa-east-1.amazonaws.com

# Build e push da app
docker build -t legacyguard-app -f Dockerfile .
docker tag legacyguard-app:latest <account-id>.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-app:latest
docker push <account-id>.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-app:latest

# Build e push do worker
docker build -t legacyguard-worker -f Dockerfile.worker .
docker tag legacyguard-worker:latest <account-id>.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-worker:latest
docker push <account-id>.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-worker:latest
```

### 4. Deploy Automático

Após o setup inicial, cada push para `main` dispara o workflow `.github/workflows/deploy-aws.yml`:

```bash
git add .
git commit -m "chore: deploy to AWS"
git push origin main
```

## 🔧 Configuração

### Variáveis de Ambiente

As variáveis são gerenciadas no **AWS Secrets Manager**:

| Variável | Descrição | Fonte |
|----------|-----------|-------|
| `OPENAI_API_KEY` | API Key do OpenAI | OpenAI Dashboard |
| `GITHUB_ID` | OAuth App Client ID | GitHub Settings |
| `GITHUB_SECRET` | OAuth App Client Secret | GitHub Settings |
| `NEXTAUTH_SECRET` | Secret para NextAuth | `openssl rand -base64 32` |
| `AUDIT_SIGNING_KEY` | Chave para assinar audit logs | `openssl rand -hex 16` |
| `AUDIT_DB_URL` | Connection string Neon | Neon Dashboard |
| `PGVECTOR_URL` | Connection string pgvector | Neon Dashboard |
| `REDIS_URL` | Connection string Upstash | Upstash Dashboard |

### Atualizar Secrets

```bash
# Via CLI
aws secretsmanager put-secret-value \
    --secret-id legacyguard/app-secrets \
    --secret-string '{"OPENAI_API_KEY":"sk-new-key"}'

# Ou re-executar o script
./infra/aws/setup-secrets.sh
```

### HTTPS (Opcional)

1. Criar certificado no ACM:
   ```bash
   aws acm request-certificate \
       --domain-name legacyguard.yourdomain.com \
       --validation-method DNS
   ```

2. Validar DNS conforme instruções do ACM

3. Atualizar `prod.tfvars`:
   ```hcl
   domain_name     = "legacyguard.yourdomain.com"
   certificate_arn = "arn:aws:acm:sa-east-1:xxx:certificate/xxx"
   ```

4. Aplicar:
   ```bash
   terraform apply -var-file="prod.tfvars"
   ```

## 📊 Monitoramento

### CloudWatch Logs

```bash
# Logs da app
aws logs tail /ecs/legacyguard-app --follow

# Logs do worker
aws logs tail /ecs/legacyguard-worker --follow
```

### ECS Status

```bash
# Status dos serviços
aws ecs describe-services \
    --cluster legacyguard-cluster \
    --services legacyguard-app legacyguard-worker \
    --query 'services[*].{name:serviceName,running:runningCount,desired:desiredCount,status:status}'
```

### Health Check

```bash
# Via ALB DNS
curl http://<alb-dns>/api/health

# Resposta esperada:
# {
#   "status": "healthy",
#   "timestamp": "2026-01-13T...",
#   "checks": { "postgres": {...}, "redis": {...}, "openai": {...} }
# }
```

## 🔄 Operações

### Escalar Serviços

```bash
# Escalar app para 4 instâncias
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-app \
    --desired-count 4

# Escalar worker
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-worker \
    --desired-count 2
```

### Rollback

```bash
# Listar task definitions
aws ecs list-task-definitions --family-prefix legacyguard-app

# Fazer rollback para versão anterior
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-app \
    --task-definition legacyguard-app:42  # versão anterior
```

### Forçar Redeploy

```bash
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-app \
    --force-new-deployment
```

### Acessar Container (Debug)

```bash
# ECS Exec (requer enable_execute_command = true)
aws ecs execute-command \
    --cluster legacyguard-cluster \
    --task <task-id> \
    --container app \
    --interactive \
    --command "/bin/sh"
```

## 💰 Custos Estimados

| Recurso | Especificação | Custo/mês (USD) |
|---------|---------------|-----------------|
| ECS Fargate (App) | 2x 1vCPU/2GB | ~$70 |
| ECS Fargate (Worker) | 1x 2vCPU/4GB | ~$70 |
| ALB | 1 LCU médio | ~$20 |
| NAT Gateway | 1 AZ | ~$45 |
| CloudWatch Logs | 10 GB | ~$5 |
| ECR | 10 GB | ~$1 |
| Secrets Manager | 2 secrets | ~$1 |
| **Total** | | **~$212** |

> 💡 Para reduzir custos:
> - Use Fargate Spot para worker
> - Reduza retention dos logs
> - Use 1 instância de app em dev

## 🔒 Segurança

### Checklist

- [x] VPC com subnets privadas
- [x] NAT Gateway para acesso outbound
- [x] Security Groups restritivos
- [x] Secrets no Secrets Manager (não em env vars)
- [x] IAM roles com least privilege
- [x] ECR image scanning habilitado
- [x] CloudWatch logs criptografados
- [ ] WAF no ALB (recomendado para prod)
- [ ] GuardDuty habilitado (recomendado)

### Rotação de Secrets

```bash
# Gerar novo NEXTAUTH_SECRET
NEW_SECRET=$(openssl rand -base64 32)

# Atualizar no Secrets Manager
aws secretsmanager put-secret-value \
    --secret-id legacyguard/app-secrets \
    --secret-string "{\"NEXTAUTH_SECRET\":\"$NEW_SECRET\"}"

# Forçar redeploy
aws ecs update-service --cluster legacyguard-cluster --service legacyguard-app --force-new-deployment
```

## 🗑️ Destruir Infraestrutura

```bash
cd infra/aws

# CUIDADO: Isso remove TODOS os recursos
terraform destroy -var-file="prod.tfvars"
```

## ❓ Troubleshooting

### Container não inicia

```bash
# Ver eventos do serviço
aws ecs describe-services \
    --cluster legacyguard-cluster \
    --services legacyguard-app \
    --query 'services[0].events[:5]'

# Ver logs da task
aws logs get-log-events \
    --log-group-name /ecs/legacyguard-app \
    --log-stream-name <stream-name>
```

### Health check falha

1. Verificar se endpoint `/api/health` existe
2. Verificar logs do container
3. Testar conexão com Neon/Upstash
4. Verificar secrets estão corretos

### Secrets não carregam

```bash
# Verificar secret existe
aws secretsmanager get-secret-value --secret-id legacyguard/app-secrets

# Verificar IAM role tem permissão
aws iam get-role-policy --role-name legacyguard-ecs-execution-role --policy-name legacyguard-ecs-secrets-policy
```

## 📚 Referências

- [AWS ECS Best Practices](https://docs.aws.amazon.com/AmazonECS/latest/bestpracticesguide/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [GitHub Actions for ECS](https://github.com/aws-actions/amazon-ecs-deploy-task-definition)
