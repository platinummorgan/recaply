-- Create recordings table
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  transcription TEXT NOT NULL,
  summary TEXT,
  action_items TEXT[],
  key_points TEXT[],
  duration_seconds INTEGER,
  file_size INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS recordings_created_at_idx ON recordings(created_at DESC);

-- Enable Row Level Security (RLS) - we'll disable it for now during testing
ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (for testing - remove in production)
CREATE POLICY "Allow all operations" ON recordings
  FOR ALL
  USING (true)
  WITH CHECK (true);
