-- Add meeting metadata columns and translation cache to recordings table
ALTER TABLE recordings
  ADD COLUMN IF NOT EXISTS meeting_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS meeting_location VARCHAR(160),
  ADD COLUMN IF NOT EXISTS meeting_context TEXT,
  ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_participants TEXT[],
  ADD COLUMN IF NOT EXISTS translation_cache_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_recordings_meeting_at ON recordings(meeting_at DESC);
