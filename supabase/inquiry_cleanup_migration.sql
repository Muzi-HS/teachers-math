-- 문의하기(inquiry_messages) 2주 지난 대화 자동 삭제 (용량 절약)
-- pg_cron으로 매일 새벽(KST 03:00 = UTC 18:00) 14일 지난 메시지를 DB에서 실제로 삭제합니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요
-- (실행 후 대시보드 > Database > Extensions에서 pg_cron이 활성화됐는지 확인해 주세요.
--  만약 "permission denied to create extension" 오류가 나면, 대시보드 UI에서
--  Database > Extensions 검색창에 pg_cron을 검색해 토글로 먼저 켠 뒤 이 파일의
--  CREATE EXTENSION 줄만 건너뛰고 나머지를 실행하시면 됩니다.)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 재실행 시 중복 등록되지 않도록 기존 동일 이름 작업 제거 후 재등록
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-inquiry-messages') THEN
    PERFORM cron.unschedule('delete-old-inquiry-messages');
  END IF;
END $$;

SELECT cron.schedule(
  'delete-old-inquiry-messages',
  '0 18 * * *',  -- 매일 UTC 18:00 = 한국시간(KST) 03:00
  $$ DELETE FROM inquiry_messages WHERE created_at < now() - interval '14 days'; $$
);
