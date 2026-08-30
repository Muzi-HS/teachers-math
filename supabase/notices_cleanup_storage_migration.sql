-- 공지사항 90일 자동삭제 시, DB 행뿐 아니라 그동안 업로드된 이미지(Storage)도 함께 정리
-- (첨부 이미지는 notices 테이블과 FK로 연결돼 있지 않아 notices 행만 지워서는
-- notice-images 버킷의 실제 파일이 남아 용량을 계속 차지하게 됨)
-- 공지사항과 동일하게 90일이 지난 이미지 파일을 그대로 정리하는 방식으로,
-- notices_richtext_and_cleanup_migration.sql에서 등록한 delete-old-notices 작업에
-- Storage 정리 구문을 추가해 재등록합니다.
-- notices_richtext_and_cleanup_migration.sql을 먼저 실행한 뒤 이 파일을 실행하세요

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-notices') THEN
    PERFORM cron.unschedule('delete-old-notices');
  END IF;
END $$;

SELECT cron.schedule(
  'delete-old-notices',
  '0 18 * * *',  -- 매일 UTC 18:00 = 한국시간(KST) 03:00
  $$
    DELETE FROM notices WHERE created_at < now() - interval '90 days';
    DELETE FROM storage.objects WHERE bucket_id = 'notice-images' AND created_at < now() - interval '90 days';
  $$
);
