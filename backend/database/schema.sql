-- Recaply Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free' CHECK (subscription_tier IN ('free', 'lite', 'pro')),
  minutes_used INTEGER NOT NULL DEFAULT 0,
  minutes_limit INTEGER NOT NULL DEFAULT 30,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Usage records table
CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minutes_used INTEGER NOT NULL,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('transcription', 'summary')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recordings table (optional - to store metadata)
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(500),
  duration_minutes INTEGER,
  meeting_name VARCHAR(120),
  meeting_location VARCHAR(160),
  meeting_context TEXT,
  meeting_at TIMESTAMPTZ,
  meeting_participants TEXT[],
  transcript TEXT,
  summary_json JSONB,
  translation_cache_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Growth rollups table (durable daily counters for paywall/translation analytics)
CREATE TABLE IF NOT EXISTS growth_event_rollups (
  day DATE NOT NULL,
  domain VARCHAR(20) NOT NULL CHECK (domain IN ('paywall', 'translation')),
  event_name VARCHAR(80) NOT NULL,
  source VARCHAR(80) NOT NULL DEFAULT 'unknown',
  variant VARCHAR(40) NOT NULL DEFAULT '',
  tier VARCHAR(30) NOT NULL DEFAULT '',
  target_language VARCHAR(60) NOT NULL DEFAULT '',
  outcome VARCHAR(60) NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, domain, event_name, source, variant, tier, target_language, outcome)
);

-- Growth rollup maintenance history (operator diagnostics/audit trail)
CREATE TABLE IF NOT EXISTS growth_rollup_maintenance_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id VARCHAR(80),
  status VARCHAR(20) NOT NULL CHECK (status IN ('completed', 'unavailable', 'failed')),
  dry_run BOOLEAN NOT NULL DEFAULT TRUE,
  max_backfill_days INTEGER NOT NULL DEFAULT 365,
  include_compaction BOOLEAN NOT NULL DEFAULT TRUE,
  persistence_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  available BOOLEAN NOT NULL DEFAULT FALSE,
  backfill_rows_written INTEGER NOT NULL DEFAULT 0,
  legacy_rows_deleted INTEGER NOT NULL DEFAULT 0,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_name VARCHAR(120),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_usage_user_id ON usage_records(user_id);
CREATE INDEX idx_usage_created_at ON usage_records(created_at);
CREATE INDEX idx_recordings_user_id ON recordings(user_id);
CREATE INDEX idx_recordings_created_at ON recordings(created_at);
CREATE INDEX idx_growth_rollups_day_domain ON growth_event_rollups(day, domain);
CREATE INDEX idx_growth_rollups_domain_event ON growth_event_rollups(domain, event_name);
CREATE INDEX idx_growth_rollup_maintenance_created_at ON growth_rollup_maintenance_runs(created_at DESC);
CREATE INDEX idx_growth_rollup_maintenance_status_created_at ON growth_rollup_maintenance_runs(status, created_at DESC);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_growth_event_rollup(
  p_day DATE,
  p_domain TEXT,
  p_event_name TEXT,
  p_source TEXT,
  p_variant TEXT,
  p_tier TEXT,
  p_target_language TEXT,
  p_outcome TEXT,
  p_count INTEGER DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO growth_event_rollups (
    day,
    domain,
    event_name,
    source,
    variant,
    tier,
    target_language,
    outcome,
    count
  )
  VALUES (
    p_day,
    p_domain,
    p_event_name,
    COALESCE(p_source, 'unknown'),
    COALESCE(p_variant, ''),
    COALESCE(p_tier, ''),
    COALESCE(p_target_language, ''),
    COALESCE(p_outcome, ''),
    COALESCE(p_count, 1)
  )
  ON CONFLICT (day, domain, event_name, source, variant, tier, target_language, outcome)
  DO UPDATE SET
    count = growth_event_rollups.count + EXCLUDED.count,
    updated_at = NOW();
END;
$$;

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
