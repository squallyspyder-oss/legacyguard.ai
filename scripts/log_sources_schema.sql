-- Schema para integração com fontes de logs
-- Fase 1 do sistema de análise de logs do LegacyGuard

-- Tabela de fontes de logs configuradas
CREATE TABLE IF NOT EXISTS log_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL, -- 'datadog', 'cloudwatch', 'papertrail', 'logtail', 'sentry'
    
    -- Credenciais criptografadas (usar pgcrypto)
    -- API keys são criptografadas com chave do ambiente
    encrypted_config BYTEA NOT NULL,
    
    -- Metadata não sensível
    region VARCHAR(50),
    service_filter VARCHAR(255), -- Filtro de serviço/app padrão
    environment VARCHAR(50), -- 'production', 'staging', 'development'
    
    -- Status
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'disabled', 'error'
    last_test_at TIMESTAMP,
    last_test_result VARCHAR(20), -- 'success', 'auth_error', 'timeout', 'error'
    last_test_message TEXT,
    
    -- Limites
    max_results_per_query INTEGER DEFAULT 100,
    rate_limit_per_minute INTEGER DEFAULT 10,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, name)
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_log_sources_user ON log_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_log_sources_provider ON log_sources(provider);
CREATE INDEX IF NOT EXISTS idx_log_sources_status ON log_sources(status);

-- Tabela de auditoria de acessos a logs
CREATE TABLE IF NOT EXISTS log_source_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Quem e quando
    user_id VARCHAR(255) NOT NULL,
    source_id UUID REFERENCES log_sources(id) ON DELETE SET NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    
    -- O que foi feito
    action VARCHAR(50) NOT NULL, -- 'query', 'configure', 'test', 'delete', 'view_result'
    
    -- Detalhes da query (sem dados sensíveis)
    query_type VARCHAR(50), -- 'search', 'tail', 'aggregate'
    query_filter TEXT, -- Filtro usado (sanitizado)
    time_range_start TIMESTAMP,
    time_range_end TIMESTAMP,
    
    -- Resultado
    status VARCHAR(20) NOT NULL, -- 'success', 'error', 'blocked', 'sanitized'
    rows_returned INTEGER,
    pii_detected BOOLEAN DEFAULT FALSE,
    pii_types TEXT[], -- Array de tipos de PII encontrados: ['email', 'cpf', 'credit_card']
    sanitization_applied BOOLEAN DEFAULT FALSE,
    
    -- Performance
    duration_ms INTEGER,
    
    -- Erro se houver
    error_code VARCHAR(50),
    error_message TEXT,
    
    -- IP e contexto (para segurança)
    ip_address INET,
    user_agent TEXT
);

-- Índices para auditoria
CREATE INDEX IF NOT EXISTS idx_log_audit_user ON log_source_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_log_audit_source ON log_source_audit(source_id);
CREATE INDEX IF NOT EXISTS idx_log_audit_timestamp ON log_source_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_log_audit_action ON log_source_audit(action);
CREATE INDEX IF NOT EXISTS idx_log_audit_pii ON log_source_audit(pii_detected) WHERE pii_detected = TRUE;

-- Tabela de cache de resultados (opcional, para reduzir chamadas à API)
CREATE TABLE IF NOT EXISTS log_query_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID REFERENCES log_sources(id) ON DELETE CASCADE,
    query_hash VARCHAR(64) NOT NULL, -- SHA256 do filtro + time range
    
    -- Resultado sanitizado
    result_count INTEGER,
    result_preview TEXT, -- Primeiras 5 linhas sanitizadas (para preview)
    
    -- Validade
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    
    UNIQUE(source_id, query_hash)
);

CREATE INDEX IF NOT EXISTS idx_log_cache_expires ON log_query_cache(expires_at);

-- Função para limpar cache expirado
CREATE OR REPLACE FUNCTION clean_expired_log_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM log_query_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_log_sources_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_sources_updated
    BEFORE UPDATE ON log_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_log_sources_timestamp();

-- Comentários para documentação
COMMENT ON TABLE log_sources IS 'Fontes de logs configuradas pelos usuários (Datadog, CloudWatch, etc)';
COMMENT ON TABLE log_source_audit IS 'Auditoria de todos os acessos a logs externos';
COMMENT ON TABLE log_query_cache IS 'Cache temporário de resultados de queries (sanitizados)';
COMMENT ON COLUMN log_sources.encrypted_config IS 'Configuração sensível (API keys) criptografada com AES-256-GCM';
COMMENT ON COLUMN log_source_audit.pii_types IS 'Tipos de PII detectados e sanitizados: email, cpf, cnpj, credit_card, phone, ip, etc';
