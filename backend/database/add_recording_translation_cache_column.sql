-- Add persistent translation cache for per-recording language variants.
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS translation_cache_json JSONB NOT NULL DEFAULT '{}'::jsonb;
