-- 사이트 설정에 "특강 관리" 배너/팝업 노출 설정을 추가한다.
-- 특강 게시물 자체(special_classes)는 그대로 두고, 노출 방식(배너 on/off, 팝업 유형/내용)만
-- site_settings 싱글턴 테이블에 얹는다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS special_class_banner_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS special_class_popup_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS special_class_popup_type     text NOT NULL DEFAULT 'text';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS special_class_popup_image_url text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS special_class_popup_title    text;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS special_class_popup_body     text;

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_special_class_popup_type_check;
ALTER TABLE site_settings ADD CONSTRAINT site_settings_special_class_popup_type_check
  CHECK (special_class_popup_type IN ('image', 'text', 'both'));

-- 스토리지 버킷: 특강/설명회 팝업·배너용 이미지
INSERT INTO storage.buckets (id, name, public)
VALUES ('promo-images', 'promo-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS promo_images_select_all ON storage.objects;
DROP POLICY IF EXISTS promo_images_insert_staff ON storage.objects;
DROP POLICY IF EXISTS promo_images_delete_staff ON storage.objects;

CREATE POLICY promo_images_select_all ON storage.objects
  FOR SELECT USING (bucket_id = 'promo-images');

CREATE POLICY promo_images_insert_staff ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'promo-images' AND is_teacher_or_admin());

CREATE POLICY promo_images_delete_staff ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'promo-images' AND is_teacher_or_admin());
