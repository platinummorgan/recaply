-- Enable Row Level Security on public tables
-- This prevents unauthorized access to user data through the Supabase API
-- 
-- NOTE: Your backend uses the SUPABASE_SERVICE_KEY which bypasses RLS automatically.
-- These policies only affect direct API access through PostgREST (Supabase client libraries).
-- Your Node.js backend will continue to work normally.

-- ============================================
-- Enable RLS on users table
-- ============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role (your backend) to do anything
-- The service role key bypasses RLS, so no policy needed

-- Policy: Block direct public access from PostgREST
-- Since you don't use Supabase Auth in the frontend, we block direct DB access
-- All access should go through your authenticated backend API

-- ============================================
-- Enable RLS on usage_records table
-- ============================================

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Policy: Block direct public access
-- All access should go through your backend with service key

-- ============================================
-- Enable RLS on recordings table (if it exists)
-- ============================================

ALTER TABLE recordings ENABLE ROW LEVEL SECURITY;

-- Policy: Block direct public access
-- All access should go through your backend with service key

-- ============================================
-- IMPORTANT NOTES:
-- ============================================
-- 1. With RLS enabled and NO policies defined, all direct access is BLOCKED
-- 2. Your backend using SUPABASE_SERVICE_KEY bypasses RLS (still has full access)
-- 3. This fixes the security warning while maintaining your app functionality
-- 4. Users can only access data through your authenticated backend API
-- 5. This is the correct security model for your architecture!
