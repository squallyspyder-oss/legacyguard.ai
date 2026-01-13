# ============================================
# Production Environment Variables
# ============================================
# Copy this file to prod.tfvars and fill in the values

aws_region  = "sa-east-1"  # São Paulo (mesmo do Neon)
environment = "production"
app_name    = "legacyguard"

# Domain (opcional - configure após primeiro deploy)
domain_name     = ""  # Ex: "legacyguard.yourdomain.com"
certificate_arn = ""  # ARN do certificado ACM (criar via AWS Console ou CLI)

# Recursos da aplicação Next.js
app_cpu    = 1024  # 1 vCPU
app_memory = 2048  # 2 GB

# Recursos do Worker (sandbox precisa mais recursos)
worker_cpu    = 2048  # 2 vCPU
worker_memory = 4096  # 4 GB

# Scaling
app_desired_count    = 2  # Alta disponibilidade
worker_desired_count = 1  # Single worker (pode escalar conforme demanda)
