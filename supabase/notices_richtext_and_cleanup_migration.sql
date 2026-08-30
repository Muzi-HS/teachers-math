-- 공지사항 이미지 첨부용 Storage 버킷 + 90일 자동삭제
-- Supabase 대시보드 > SQL Editor에서 실행하세요

-- 1) 공지사항 본문에 삽입할 이미지를 저장할 공개 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('notice-images', 'notice-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS notice_images_public_read ON storage.objects;
DROP POLICY IF EXISTS notice_images_staff_insert ON storage.objects;
DROP POLICY IF EXISTS notice_images_staff_delete ON storage.objects;

-- 공지 이미지는 학부모도 봐야 하므로 조회는 완전 공개
CREATE POLICY notice_images_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'notice-images');

-- 업로드/삭제는 관리자·선생님·조교만 (Supabase Auth 세션 필요)
CREATE POLICY notice_images_staff_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'notice-images' AND is_teacher_or_admin());
CREATE POLICY notice_images_staff_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'notice-images' AND is_teacher_or_admin());

-- 2) 공지사항 90일 자동삭제 (문의하기 자동삭제와 동일한 pg_cron 방식)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'delete-old-notices') THEN
    PERFORM cron.unschedule('delete-old-notices');
  END IF;
END $$;

SELECT cron.schedule(
  'delete-old-notices',
  '0 18 * * *',  -- 매일 UTC 18:00 = 한국시간(KST) 03:00
  $$ DELETE FROM notices WHERE created_at < now() - interval '90 days'; $$
);
