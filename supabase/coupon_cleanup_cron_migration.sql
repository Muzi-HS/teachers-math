-- Run after coupon_processing_migration.sql. Requires Supabase pg_cron.
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('delete-used-student-coupons', '* * * * *',
  $$DELETE FROM public.student_coupons WHERE used = true AND used_at <= now() - interval '24 hours'$$);
