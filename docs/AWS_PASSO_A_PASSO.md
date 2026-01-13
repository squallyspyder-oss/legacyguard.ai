# 🚀 Guia Completo AWS para Iniciantes - LegacyGuard

> **Este guia assume que você NUNCA usou AWS antes.**  
> Cada passo tem explicações detalhadas do que está acontecendo.

---

## 📚 Índice

1. [O que é AWS e por que usar](#1-o-que-é-aws-e-por-que-usar)
2. [Criar conta AWS](#2-criar-conta-aws)
3. [Configurar segurança da conta](#3-configurar-segurança-da-conta)
4. [Instalar ferramentas no seu computador](#4-instalar-ferramentas-no-seu-computador)
5. [Criar usuário para deploy (IAM)](#5-criar-usuário-para-deploy-iam)
6. [Configurar AWS CLI](#6-configurar-aws-cli)
7. [Configurar secrets no GitHub](#7-configurar-secrets-no-github)
8. [Executar Terraform (criar infraestrutura)](#8-executar-terraform-criar-infraestrutura)
9. [Configurar secrets da aplicação](#9-configurar-secrets-da-aplicação)
10. [Primeiro deploy](#10-primeiro-deploy)
11. [Verificar se está funcionando](#11-verificar-se-está-funcionando)
12. [Configurar domínio personalizado (opcional)](#12-configurar-domínio-personalizado-opcional)
13. [Monitoramento e logs](#13-monitoramento-e-logs)
14. [Custos e como economizar](#14-custos-e-como-economizar)
15. [Troubleshooting (problemas comuns)](#15-troubleshooting-problemas-comuns)

---

## 1. O que é AWS e por que usar

### O que é AWS?
**Amazon Web Services (AWS)** é a maior plataforma de cloud computing do mundo. Em vez de comprar servidores físicos, você "aluga" computadores da Amazon que ficam em data centers pelo mundo.

### Por que estamos migrando para AWS?
| Render (antes) | AWS (agora) |
|----------------|-------------|
| Simples mas limitado | Controle total |
| Sandbox com restrições | Sandbox completo com isolamento |
| Menos opções de recursos | Escala ilimitada |
| ~$14/mês básico | ~$212/mês (mais recursos) |

### Serviços AWS que vamos usar

| Serviço | O que faz | Analogia simples |
|---------|-----------|------------------|
| **ECR** | Guarda as imagens Docker | "Google Drive para containers" |
| **ECS Fargate** | Roda os containers | "Computador na nuvem" |
| **ALB** | Distribui tráfego | "Recepcionista que direciona visitantes" |
| **VPC** | Rede privada | "Seu próprio prédio com segurança" |
| **Secrets Manager** | Guarda senhas | "Cofre digital" |
| **CloudWatch** | Logs e métricas | "Câmeras de segurança" |

---

## 2. Criar conta AWS

### Passo 2.1: Acessar o site

1. Abra o navegador
2. Acesse: **https://aws.amazon.com**
3. Clique no botão **"Criar uma conta da AWS"** (canto superior direito)

### Passo 2.2: Preencher dados

```
📧 Email: seu-email@exemplo.com (use um email que você acessa)
🔐 Senha: Crie uma senha FORTE (mínimo 8 caracteres, números, símbolos)
👤 Nome da conta: legacyguard-prod (ou qualquer nome)
```

### Passo 2.3: Informações de contato

- Selecione: **"Pessoal"** ou **"Profissional"**
- Preencha nome, telefone, endereço
- País: Brasil

### Passo 2.4: Cartão de crédito

⚠️ **IMPORTANTE**: A AWS vai cobrar **$1 USD** para verificar o cartão (é devolvido).

- Preencha os dados do cartão
- Cartão internacional funciona melhor
- Débito ou crédito

### Passo 2.5: Verificação por telefone

- Digite seu número com código do país: **+55 11 99999-9999**
- Você receberá um código por SMS ou ligação
- Digite o código recebido

### Passo 2.6: Selecionar plano

Escolha: **"Basic Support - Gratuito"**

> Os outros planos são para empresas grandes e custam a partir de $29/mês

### Passo 2.7: Concluir

- Clique em **"Concluir cadastro"**
- Aguarde o email de confirmação (pode levar até 24h, mas geralmente é instantâneo)

---

## 3. Configurar segurança da conta

### Por que isso é importante?
Sua conta AWS terá acesso a recursos que custam dinheiro. Se alguém roubar sua senha, pode gastar milhares de dólares.

### Passo 3.1: Ativar MFA (autenticação em dois fatores)

1. Faça login em: **https://console.aws.amazon.com**
2. No canto superior direito, clique no seu nome
3. Clique em **"Security credentials"** (Credenciais de segurança)
4. Na seção **"Multi-factor authentication (MFA)"**, clique **"Assign MFA device"**
5. Escolha **"Authenticator app"**
6. Use um app no celular:
   - **Google Authenticator** (Android/iOS)
   - **Microsoft Authenticator** (Android/iOS)
   - **Authy** (Android/iOS)
7. Escaneie o QR code com o app
8. Digite os 2 códigos que aparecem no app
9. Clique **"Add MFA"**

✅ Agora toda vez que fizer login, vai precisar do código do app.

### Passo 3.2: Criar alerta de gastos

1. No console AWS, pesquise por **"Billing"** na barra de busca
2. No menu lateral, clique em **"Budgets"**
3. Clique **"Create budget"**
4. Selecione **"Use a template"**
5. Escolha **"Monthly cost budget"**
6. Configure:
   - **Budget name**: `legacyguard-monthly`
   - **Budgeted amount**: `300` (USD)
   - **Email**: seu email
7. Clique **"Create budget"**

✅ Você receberá email se os gastos passarem de $300/mês.

---

## 4. Instalar ferramentas no seu computador

Você vai precisar de 3 ferramentas instaladas.

### Passo 4.1: Instalar AWS CLI

**AWS CLI** é um programa de linha de comando para controlar a AWS.

#### Windows:

1. Baixe: https://awscli.amazonaws.com/AWSCLIV2.msi
2. Execute o instalador
3. Clique "Next" até finalizar
4. Abra o **Prompt de Comando** (cmd) ou **PowerShell**
5. Digite: `aws --version`
6. Deve aparecer algo como: `aws-cli/2.x.x Python/3.x.x Windows/10`

#### macOS:

```bash
# Abra o Terminal e execute:
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# Verificar instalação:
aws --version
```

#### Linux (Ubuntu/Debian):

```bash
# Abra o Terminal e execute:
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Verificar instalação:
aws --version
```

### Passo 4.2: Instalar Terraform

**Terraform** é uma ferramenta que cria infraestrutura automaticamente.

#### Windows:

1. Baixe: https://releases.hashicorp.com/terraform/1.7.0/terraform_1.7.0_windows_amd64.zip
2. Extraia o arquivo `terraform.exe`
3. Mova para `C:\Windows\` (ou adicione ao PATH)
4. Abra novo terminal e digite: `terraform --version`

#### macOS:

```bash
# Se tiver Homebrew:
brew install terraform

# Verificar:
terraform --version
```

#### Linux:

```bash
# Ubuntu/Debian
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install terraform

# Verificar:
terraform --version
```

### Passo 4.3: Instalar Git (se não tiver)

#### Windows:
Baixe: https://git-scm.com/download/win

#### macOS:
```bash
xcode-select --install
```

#### Linux:
```bash
sudo apt install git
```

---

## 5. Criar usuário para deploy (IAM)

### O que é IAM?
**IAM (Identity and Access Management)** é o sistema de permissões da AWS. Vamos criar um usuário específico para o deploy, em vez de usar a conta principal (mais seguro).

### Passo 5.1: Acessar IAM

1. Faça login no console AWS: https://console.aws.amazon.com
2. Na barra de busca, digite **"IAM"** e clique no resultado
3. No menu lateral esquerdo, clique em **"Users"** (Usuários)

### Passo 5.2: Criar usuário

1. Clique no botão **"Create user"** (Criar usuário)
2. **User name**: `legacyguard-deploy`
3. Clique **"Next"**

### Passo 5.3: Definir permissões

1. Selecione **"Attach policies directly"** (Anexar políticas diretamente)
2. Na busca, procure e marque TODAS estas políticas:
   
   ```
   ✅ AmazonECS_FullAccess
   ✅ AmazonEC2ContainerRegistryFullAccess
   ✅ AmazonVPCFullAccess
   ✅ ElasticLoadBalancingFullAccess
   ✅ SecretsManagerReadWrite
   ✅ CloudWatchLogsFullAccess
   ✅ IAMFullAccess
   ```

3. Clique **"Next"**
4. Clique **"Create user"**

### Passo 5.4: Criar chave de acesso

1. Clique no usuário **"legacyguard-deploy"** que você acabou de criar
2. Vá na aba **"Security credentials"** (Credenciais de segurança)
3. Na seção **"Access keys"**, clique **"Create access key"**
4. Selecione **"Command Line Interface (CLI)"**
5. Marque a caixa de confirmação
6. Clique **"Next"**
7. Clique **"Create access key"**

### ⚠️ MUITO IMPORTANTE - SALVE ESTAS INFORMAÇÕES:

```
Access key ID:     AKIA1234567890EXAMPLE
Secret access key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

**GUARDE EM LOCAL SEGURO!** Esta é a ÚNICA vez que você verá a Secret Access Key.

> 💡 Dica: Salve em um gerenciador de senhas como 1Password, Bitwarden ou LastPass.

---

## 6. Configurar AWS CLI

Agora vamos conectar seu computador à AWS.

### Passo 6.1: Executar configuração

Abra o terminal (Prompt de Comando, PowerShell ou Terminal) e execute:

```bash
aws configure
```

### Passo 6.2: Preencher as informações

O terminal vai pedir 4 informações:

```
AWS Access Key ID [None]: AKIA1234567890EXAMPLE
(Cole a Access Key ID que você salvou)

AWS Secret Access Key [None]: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
(Cole a Secret Access Key que você salvou)

Default region name [None]: sa-east-1
(Digite: sa-east-1 - é São Paulo, mais perto do Brasil)

Default output format [None]: json
(Digite: json)
```

### Passo 6.3: Testar conexão

```bash
aws sts get-caller-identity
```

Se funcionar, você verá algo como:

```json
{
    "UserId": "AIDA1234567890EXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/legacyguard-deploy"
}
```

✅ **Parabéns!** Seu computador está conectado à AWS.

---

## 7. Configurar secrets no GitHub

O GitHub Actions precisa das credenciais AWS para fazer deploy automático.

### Passo 7.1: Acessar configurações do repositório

1. Acesse: https://github.com/squallyspyder-oss/legacyguard.ai
2. Clique na aba **"Settings"** (Configurações)
3. No menu lateral, clique em **"Secrets and variables"**
4. Clique em **"Actions"**

### Passo 7.2: Adicionar secrets

Clique em **"New repository secret"** para cada um:

#### Secret 1: AWS_ACCESS_KEY_ID
```
Name:   AWS_ACCESS_KEY_ID
Secret: AKIA1234567890EXAMPLE
(Cole sua Access Key ID)
```

#### Secret 2: AWS_SECRET_ACCESS_KEY
```
Name:   AWS_SECRET_ACCESS_KEY
Secret: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
(Cole sua Secret Access Key)
```

### Passo 7.3: Verificar

Você deve ver 2 secrets listados:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

✅ GitHub configurado para deploy automático!

---

## 8. Executar Terraform (criar infraestrutura)

Agora vamos criar toda a infraestrutura na AWS.

### Passo 8.1: Clonar o repositório (se ainda não tiver)

```bash
git clone https://github.com/squallyspyder-oss/legacyguard.ai.git
cd legacyguard.ai
```

### Passo 8.2: Ir para pasta do Terraform

```bash
cd infra/aws
```

### Passo 8.3: Inicializar Terraform

```bash
terraform init
```

Você verá:
```
Initializing the backend...
Initializing provider plugins...
- Finding hashicorp/aws versions matching "~> 5.0"...
- Installing hashicorp/aws v5.x.x...

Terraform has been successfully initialized!
```

### Passo 8.4: Ver o que será criado (Preview)

```bash
terraform plan -var-file="prod.tfvars"
```

Isso mostra TUDO que será criado. Você verá uma lista longa de recursos.

No final, algo como:
```
Plan: 35 to add, 0 to change, 0 to destroy.
```

### Passo 8.5: Criar a infraestrutura

⚠️ **ATENÇÃO**: Este comando VAI criar recursos que CUSTAM DINHEIRO.

```bash
terraform apply -var-file="prod.tfvars"
```

O Terraform vai perguntar:
```
Do you want to perform these actions?
  Terraform will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value:
```

Digite **`yes`** e pressione Enter.

### Passo 8.6: Aguardar (5-10 minutos)

O Terraform vai criar cada recurso. Você verá mensagens como:

```
aws_vpc.main: Creating...
aws_vpc.main: Creation complete after 3s [id=vpc-0abc123def456]
aws_subnet.public[0]: Creating...
...
```

### Passo 8.7: Salvar os outputs

No final, você verá os outputs importantes:

```
Apply complete! Resources: 35 added, 0 changed, 0 destroyed.

Outputs:

alb_dns_name = "legacyguard-alb-1234567890.sa-east-1.elb.amazonaws.com"
ecr_app_repository_url = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-app"
ecr_worker_repository_url = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-worker"
ecs_cluster_name = "legacyguard-cluster"
```

**ANOTE O `alb_dns_name`** - essa será a URL da sua aplicação!

---

## 9. Configurar secrets da aplicação

Agora vamos colocar as senhas da aplicação na AWS.

### Passo 9.1: Preparar o arquivo .env.local

Volte para a raiz do projeto:

```bash
cd ../..  # Volta para legacyguard.ai/
```

Edite o arquivo `.env.local` com suas credenciais reais:

```bash
# Windows (Notepad)
notepad .env.local

# macOS/Linux (nano)
nano .env.local
```

### Passo 9.2: Preencher as variáveis

O arquivo deve ter:

```env
# OpenAI (obrigatório)
OPENAI_API_KEY=sk-proj-sua-chave-openai-aqui

# GitHub OAuth (obrigatório)
GITHUB_ID=seu-github-client-id
GITHUB_SECRET=seu-github-client-secret

# NextAuth (obrigatório)
NEXTAUTH_SECRET=gere-uma-senha-aleatoria-longa

# Neon PostgreSQL (já configurado)
AUDIT_DB_URL=postgresql://neondb_owner:xxx@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
PGVECTOR_URL=postgresql://neondb_owner:xxx@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require

# Upstash Redis (já configurado)
REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
REDIS_TLS_URL=rediss://default:xxx@xxx.upstash.io:6379

# Audit (gere com: openssl rand -hex 16)
AUDIT_SIGNING_KEY=sua-chave-hex-de-32-caracteres
```

### Passo 9.3: Executar script de upload

```bash
cd infra/aws
chmod +x setup-secrets.sh  # Torna executável (Linux/macOS)
./setup-secrets.sh
```

No Windows, use Git Bash ou execute manualmente:

```bash
bash setup-secrets.sh
```

Você verá:
```
🔐 Configurando secrets no AWS Secrets Manager...
📋 Verificando variáveis obrigatórias...
   ✅ OPENAI_API_KEY
   ✅ GITHUB_ID
   ✅ GITHUB_SECRET
   ...
🚀 Atualizando secrets no AWS Secrets Manager...
✅ Secrets configurados com sucesso!
```

---

## 10. Primeiro deploy

### Passo 10.1: Fazer primeiro build das imagens

Precisamos enviar as imagens Docker para a AWS pela primeira vez.

```bash
# Voltar para raiz do projeto
cd ../..

# Descobrir seu Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Seu Account ID: $AWS_ACCOUNT_ID"

# Login no ECR
aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.sa-east-1.amazonaws.com
```

### Passo 10.2: Build e push da aplicação

```bash
# Build da imagem da app
docker build -t legacyguard-app -f Dockerfile .

# Tag com URL do ECR
docker tag legacyguard-app:latest ${AWS_ACCOUNT_ID}.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-app:latest

# Push para ECR
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-app:latest
```

### Passo 10.3: Build e push do worker

```bash
# Build da imagem do worker
docker build -t legacyguard-worker -f Dockerfile.worker .

# Tag com URL do ECR
docker tag legacyguard-worker:latest ${AWS_ACCOUNT_ID}.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-worker:latest

# Push para ECR
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.sa-east-1.amazonaws.com/legacyguard-worker:latest
```

### Passo 10.4: Forçar deploy no ECS

```bash
# Atualizar serviço da app
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-app \
    --force-new-deployment

# Atualizar serviço do worker
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-worker \
    --force-new-deployment
```

### Passo 10.5: Aguardar deploy (3-5 minutos)

```bash
# Ver status do deploy
aws ecs describe-services \
    --cluster legacyguard-cluster \
    --services legacyguard-app legacyguard-worker \
    --query 'services[*].{name:serviceName,running:runningCount,desired:desiredCount,status:status}' \
    --output table
```

Quando estiver pronto:
```
------------------------------------------------------
|               DescribeServices                      |
+-------+------------------+-----------+--------------+
| desired|      name       |  running  |   status    |
+-------+------------------+-----------+--------------+
|  2    |  legacyguard-app |     2     |   ACTIVE    |
|  1    | legacyguard-worker|    1     |   ACTIVE    |
+-------+------------------+-----------+--------------+
```

---

## 11. Verificar se está funcionando

### Passo 11.1: Obter URL do Load Balancer

```bash
aws elbv2 describe-load-balancers \
    --names legacyguard-alb \
    --query 'LoadBalancers[0].DNSName' \
    --output text
```

Resultado: `legacyguard-alb-1234567890.sa-east-1.elb.amazonaws.com`

### Passo 11.2: Testar health check

```bash
curl http://legacyguard-alb-1234567890.sa-east-1.elb.amazonaws.com/api/health
```

Resposta esperada:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-13T16:30:00.000Z",
  "version": "1.0.0",
  "uptime": 120,
  "checks": {
    "postgres": { "status": "ok", "latencyMs": 45 },
    "redis": { "status": "ok", "latencyMs": 12 },
    "openai": { "status": "ok", "latencyMs": 1 }
  }
}
```

### Passo 11.3: Acessar no navegador

Abra no navegador:
```
http://legacyguard-alb-1234567890.sa-east-1.elb.amazonaws.com
```

🎉 **Se você ver a página do LegacyGuard, PARABÉNS! O deploy funcionou!**

---

## 12. Configurar domínio personalizado (opcional)

Se você tem um domínio próprio (ex: legacyguard.seusite.com).

### Passo 12.1: Criar certificado HTTPS

1. No console AWS, pesquise **"Certificate Manager"** ou **"ACM"**
2. Clique **"Request certificate"**
3. Selecione **"Request a public certificate"**
4. **Domain name**: `legacyguard.seusite.com`
5. **Validation method**: DNS validation
6. Clique **"Request"**

### Passo 12.2: Validar domínio

1. O ACM mostrará um registro CNAME que você precisa adicionar
2. Vá no painel do seu domínio (GoDaddy, Cloudflare, Registro.br, etc.)
3. Adicione o registro CNAME mostrado
4. Aguarde validação (pode levar até 30 minutos)

### Passo 12.3: Adicionar registro DNS

No painel do seu domínio, adicione:

```
Tipo: CNAME
Nome: legacyguard
Valor: legacyguard-alb-1234567890.sa-east-1.elb.amazonaws.com
```

### Passo 12.4: Atualizar Terraform

Edite `infra/aws/prod.tfvars`:

```hcl
domain_name     = "legacyguard.seusite.com"
certificate_arn = "arn:aws:acm:sa-east-1:123456789012:certificate/abc-123-def"
```

Execute:
```bash
cd infra/aws
terraform apply -var-file="prod.tfvars"
```

---

## 13. Monitoramento e logs

### Ver logs da aplicação

```bash
# Últimos logs da app
aws logs tail /ecs/legacyguard-app --follow

# Últimos logs do worker
aws logs tail /ecs/legacyguard-worker --follow
```

Pressione `Ctrl+C` para parar.

### Ver logs no console web

1. Acesse: https://console.aws.amazon.com
2. Pesquise **"CloudWatch"**
3. No menu lateral: **"Logs"** → **"Log groups"**
4. Clique em `/ecs/legacyguard-app` ou `/ecs/legacyguard-worker`

### Ver métricas

1. No CloudWatch, vá em **"Metrics"** → **"All metrics"**
2. Clique em **"ECS"** → **"ClusterName, ServiceName"**
3. Você verá gráficos de CPU e Memória

---

## 14. Custos e como economizar

### Estimativa mensal

| Recurso | Custo estimado |
|---------|---------------|
| ECS Fargate (App 2x) | $70 |
| ECS Fargate (Worker 1x) | $70 |
| NAT Gateway | $45 |
| ALB | $20 |
| CloudWatch | $5 |
| ECR | $1 |
| Secrets Manager | $1 |
| **Total** | **~$212/mês** |

### Como economizar

#### 1. Usar Fargate Spot para Worker (economia de 70%)

O worker não precisa estar sempre disponível. Edite o Terraform:

```hcl
# No arquivo main.tf, no resource aws_ecs_service.worker:
capacity_provider_strategy {
  capacity_provider = "FARGATE_SPOT"
  weight            = 100
}
```

#### 2. Reduzir instâncias da App

Se o tráfego for baixo, use 1 instância em vez de 2:

```bash
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-app \
    --desired-count 1
```

#### 3. Desligar à noite (se for ambiente de dev)

```bash
# Parar (economia total enquanto parado)
aws ecs update-service --cluster legacyguard-cluster --service legacyguard-app --desired-count 0
aws ecs update-service --cluster legacyguard-cluster --service legacyguard-worker --desired-count 0

# Ligar novamente
aws ecs update-service --cluster legacyguard-cluster --service legacyguard-app --desired-count 2
aws ecs update-service --cluster legacyguard-cluster --service legacyguard-worker --desired-count 1
```

---

## 15. Troubleshooting (problemas comuns)

### Problema: "Access Denied" no Terraform

**Causa**: Falta de permissões no usuário IAM.

**Solução**: Adicione a política que está faltando:
1. Vá em IAM → Users → legacyguard-deploy
2. Clique em "Add permissions"
3. Adicione a política mencionada no erro

### Problema: Container não inicia (ECS)

**Como diagnosticar**:
```bash
# Ver eventos do serviço
aws ecs describe-services \
    --cluster legacyguard-cluster \
    --services legacyguard-app \
    --query 'services[0].events[:5]'
```

**Causas comuns**:
- Imagem não existe no ECR → Refaça o push
- Secrets não encontrados → Execute setup-secrets.sh novamente
- Porta errada → Verifique se usa porta 3000

### Problema: Health check falha

**Como diagnosticar**:
```bash
# Ver logs recentes
aws logs tail /ecs/legacyguard-app --since 5m
```

**Causas comuns**:
- Aplicação com erro → Veja os logs
- Banco de dados inacessível → Verifique AUDIT_DB_URL
- Redis inacessível → Verifique REDIS_URL

### Problema: Site lento ou timeout

**Causa**: App pode estar sobrecarregada.

**Solução**: Escalar para mais instâncias:
```bash
aws ecs update-service \
    --cluster legacyguard-cluster \
    --service legacyguard-app \
    --desired-count 4
```

### Problema: "terraform apply" dá erro

**Solução geral**:
```bash
# Atualizar providers
terraform init -upgrade

# Tentar novamente
terraform apply -var-file="prod.tfvars"
```

### Problema: Credenciais AWS expiraram

**Solução**: Reconfigurar:
```bash
aws configure
# Insira as credenciais novamente
```

---

## 🎉 Conclusão

Se você seguiu todos os passos, agora tem:

✅ Conta AWS configurada com segurança  
✅ Infraestrutura completa na AWS  
✅ Deploy automático via GitHub Actions  
✅ Aplicação rodando em São Paulo (sa-east-1)  
✅ Logs e monitoramento configurados  

### Próximos passos recomendados

1. **Configurar domínio próprio** (Seção 12)
2. **Criar alertas de custo** adicionais
3. **Backup** do banco Neon (eles fazem automático, mas verifique)
4. **Documentar** as credenciais em local seguro

### Precisa de ajuda?

- **Documentação AWS**: https://docs.aws.amazon.com
- **Terraform AWS**: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- **Logs do sistema**: CloudWatch no console AWS

---

> 📅 Guia criado em: Janeiro 2026  
> 🔄 Última atualização: 2026-01-13
