-- Persist operator-visible growth rollup maintenance history.
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

CREATE INDEX IF NOT EXISTS idx_growth_rollup_maintenance_created_at
  ON growth_rollup_maintenance_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_growth_rollup_maintenance_status_created_at
  ON growth_rollup_maintenance_runs(status, created_at DESC);
