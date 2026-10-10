-- Run in Supabase SQL Editor after auto_grading_migration.sql. Safe to run again.
-- New attempts have three minutes. Preserve already-started and submitted attempts.
ALTER TABLE public.test_attempts
  ALTER COLUMN deadline_at SET DEFAULT (clock_timestamp() + interval '3 minutes');
