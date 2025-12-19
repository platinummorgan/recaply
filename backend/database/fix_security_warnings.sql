-- Fix remaining security warnings

-- ============================================
-- 1. Fix Function Search Path Mutable
-- ============================================
-- Recreate ALL update functions with fixed search_path to prevent search_path hijacking attacks

-- Fix update_updated_at function (if it exists)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- Fix update_updated_at_column function (if it exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- ============================================
-- 2. Leaked Password Protection
-- ============================================
-- NOTE: This warning is about Supabase Auth settings, NOT SQL.
-- Since you're using custom JWT authentication (not Supabase Auth),
-- this warning doesn't apply to your app.
-- 
-- If you want to enable it anyway (for future use):
-- 1. Go to: Supabase Dashboard → Authentication → Policies
-- 2. Enable "Check against Have I Been Pwned database"
-- 
-- However, your app handles passwords in your Node.js backend,
-- so Supabase Auth is not involved in your password validation.
-- You would need to implement HaveIBeenPwned checking in your backend
-- if you want this protection.
