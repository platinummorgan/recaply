-- SQL query to create demo user for Apple Review
-- Run this in your Supabase SQL Editor at: https://supabase.com/dashboard

-- First, let's check if the user exists and delete it if it does
DELETE FROM users WHERE email = 'apple.review@recaply.app';

-- Create the demo user with premium subscription
-- Password: Test1234!
-- Hash generated with bcrypt (10 rounds)
INSERT INTO users (email, password_hash, subscription_tier, minutes_used, minutes_limit)
VALUES (
  'apple.review@recaply.app',
  '$2a$10$RxrlEgRxZRzRlmtM8oHMVOvfcVlfgcgZemDWCOdjtbhHbUaLMDKNS',
  'pro',
  0,
  999999
);

-- Verify the user was created
SELECT id, email, subscription_tier, minutes_limit, created_at
FROM users
WHERE email = 'apple.review@recaply.app';
