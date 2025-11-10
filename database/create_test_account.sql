-- Test Account for Google Play Review
-- Email: reviewer@recaply.app
-- Password: TestReview2024!
-- Tier: Pro (unlimited)

-- First, create the user in auth.users (Supabase Auth)
-- Password hash for "TestReview2024!" using bcrypt
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'reviewer@recaply.app',
  '$2a$10$qKvH9L7X1RYvKp6tGxO4pOYZ3qW7qF9kL8xN5jP2mV3nB4rT6sU8m', -- TestReview2024!
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  false,
  'authenticated'
)
ON CONFLICT (id) DO NOTHING;

-- Insert identity
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  '{"sub":"00000000-0000-0000-0000-000000000001","email":"reviewer@recaply.app"}'::jsonb,
  'email',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Now create the user in public.users table with Pro tier
INSERT INTO public.users (
  id,
  email,
  username,
  subscription_tier,
  minutes_limit,
  minutes_used,
  created_at
) VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'reviewer@recaply.app',
  'Google Play Reviewer',
  'pro',
  999999,
  0,
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  subscription_tier = 'pro',
  minutes_limit = 999999,
  minutes_used = 0;

-- Add some sample recordings for testing
INSERT INTO public.recordings (
  id,
  user_id,
  filename,
  transcription,
  summary,
  file_size,
  audio_url,
  created_at
) VALUES 
(
  '10000000-0000-0000-0000-000000000001'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'sample-meeting-notes.m4a',
  'This is a sample transcription of a team meeting. We discussed the upcoming product launch, marketing strategies, and assigned tasks to team members. The deadline for the launch is next month, and everyone agreed to complete their assignments by the end of this week.',
  'Team meeting discussing product launch. Key points: upcoming launch next month, marketing strategies reviewed, tasks assigned with end-of-week deadline.',
  524288,
  'https://negarkyrbnblogrzkyft.supabase.co/storage/v1/object/public/audio-recordings/sample.m4a',
  NOW() - INTERVAL '2 days'
),
(
  '10000000-0000-0000-0000-000000000002'::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'sample-lecture.m4a',
  'Introduction to machine learning. Machine learning is a subset of artificial intelligence that enables computers to learn from data without being explicitly programmed. There are three main types: supervised learning, unsupervised learning, and reinforcement learning.',
  'Lecture on machine learning basics. Covers definition as AI subset, learning from data, and three main types: supervised, unsupervised, and reinforcement learning.',
  786432,
  'https://negarkyrbnblogrzkyft.supabase.co/storage/v1/object/public/audio-recordings/sample2.m4a',
  NOW() - INTERVAL '1 day'
);
