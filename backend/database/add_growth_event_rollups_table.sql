-- Durable daily growth counters for paywall/translation analytics.
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

CREATE INDEX IF NOT EXISTS idx_growth_rollups_day_domain
  ON growth_event_rollups(day, domain);

CREATE INDEX IF NOT EXISTS idx_growth_rollups_domain_event
  ON growth_event_rollups(domain, event_name);

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
