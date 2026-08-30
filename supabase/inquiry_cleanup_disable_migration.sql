-- 문의하기 2주 자동삭제 기능 해제
-- inquiry_cleanup_migration.sql에서 등록한 pg_cron 작업(delete-old-inquiry-messages)을
-- 제거합니다. 이후 문의 내역은 자동 삭제되지 않고 계속 유지됩니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-inquiry-messages') THEN
    PERFORM cron.unschedule('delete-old-inquiry-messages');
  END IF;
END $$;
