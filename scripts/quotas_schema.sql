-- Schema de quotas para LegacyGuard
-- Requer Postgres (Neon)

-- Planos e limites por usuário
CREATE TABLE IF NOT EXISTS user_quotas (
  user_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL DEFAULT 'free',
  monthly_tokens BIGINT NOT NULL DEFAULT 100000,
  monthly_usd NUMERIC(12,4) DEFAULT 5.00,
  daily_usd NUMERIC(12,4) DEFAULT 1.00,
  hard_cap BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uso mensal por usuário
CREATE TABLE IF NOT EXISTS user_usage (
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  usd_used NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, month)
);

-- Uso diário por usuário
CREATE TABLE IF NOT EXISTS user_usage_daily (
  user_id TEXT NOT NULL,
  day DATE NOT NULL,
  tokens_used BIGINT NOT NULL DEFAULT 0,
  usd_used NUMERIC(12,4) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, day)
);

-- Uso global por hora (para circuit breaker)
CREATE TABLE IF NOT EXISTS global_usage_hourly (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usd NUMERIC(12,4) NOT NULL
);

-- Estado do circuit breaker
CREATE TABLE IF NOT EXISTS circuit_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  tripped_until TIMESTAMPTZ,
  threshold_usd NUMERIC(12,4),
  paused_ms BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reservas de quota (para tarefas longas)
CREATE TABLE IF NOT EXISTS quota_reservations (
  task_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  tokens_reserved BIGINT NOT NULL DEFAULT 0,
  usd_reserved NUMERIC(12,4) NOT NULL DEFAULT 0,
  consumed BOOLEAN DEFAULT FALSE,
  refunded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_user_usage_month ON user_usage (month);
CREATE INDEX IF NOT EXISTS idx_user_usage_daily_day ON user_usage_daily (day);
CREATE INDEX IF NOT EXISTS idx_global_usage_hourly_ts ON global_usage_hourly (ts DESC);
CREATE INDEX IF NOT EXISTS idx_quota_reservations_user ON quota_reservations (user_id, month);

-- Inserir estado inicial do circuit breaker
INSERT INTO circuit_state (id, threshold_usd, paused_ms)
VALUES (1, 100.00, 300000)
ON CONFLICT (id) DO NOTHING;
