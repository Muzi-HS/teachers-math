-- 특강 배너/팝업 노출 설정을 site_settings의 전역 설정 1개에서, 학부모 설명회처럼
-- 특강 게시물(special_classes) 항목별 설정으로 바꾼다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE special_classes ADD COLUMN IF NOT EXISTS banner_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE special_classes ADD COLUMN IF NOT EXISTS popup_enabled  boolean NOT NULL DEFAULT false;
ALTER TABLE special_classes ADD COLUMN IF NOT EXISTS popup_type     text NOT NULL DEFAULT 'text';
ALTER TABLE special_classes ADD COLUMN IF NOT EXISTS popup_image_url text;
ALTER TABLE special_classes ADD COLUMN IF NOT EXISTS popup_title    text;
ALTER TABLE special_classes ADD COLUMN IF NOT EXISTS popup_body     text;

ALTER TABLE special_classes DROP CONSTRAINT IF EXISTS special_classes_popup_type_check;
ALTER TABLE special_classes ADD CONSTRAINT special_classes_popup_type_check
  CHECK (popup_type IN ('image', 'text', 'both'));

-- 기존 site_settings의 전역 특강 배너/팝업 설정값을, 현재 노출 중인 특강 게시물들에 1회 이관
UPDATE special_classes sc SET
  banner_enabled = ss.special_class_banner_enabled,
  popup_enabled = ss.special_class_popup_enabled,
  popup_type = ss.special_class_popup_type,
  popup_image_url = ss.special_class_popup_image_url,
  popup_title = ss.special_class_popup_title,
  popup_body = ss.special_class_popup_body
FROM site_settings ss
WHERE ss.id = 1 AND sc.is_active = true;

-- 더 이상 쓰지 않는 site_settings의 전역 특강 배너/팝업 컬럼 제거
ALTER TABLE site_settings DROP COLUMN IF EXISTS special_class_banner_enabled;
ALTER TABLE site_settings DROP COLUMN IF EXISTS special_class_popup_enabled;
ALTER TABLE site_settings DROP COLUMN IF EXISTS special_class_popup_type;
ALTER TABLE site_settings DROP COLUMN IF EXISTS special_class_popup_image_url;
ALTER TABLE site_settings DROP COLUMN IF EXISTS special_class_popup_title;
ALTER TABLE site_settings DROP COLUMN IF EXISTS special_class_popup_body;
