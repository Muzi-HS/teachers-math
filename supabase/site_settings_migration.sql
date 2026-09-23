-- 사이트 설정(계절 시각 효과 등) — 싱글턴 테이블. admin 대시보드에서 저장하고,
-- 비로그인 방문자를 포함한 모든 사용자가 홈페이지에서 읽을 수 있어야 하므로 anon SELECT를 허용한다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS site_settings (
  id                     integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- 싱글턴(행 1개만 존재)
  season_effect_enabled  boolean NOT NULL DEFAULT false,
  season_mode            text    NOT NULL DEFAULT 'manual' CHECK (season_mode IN ('manual', 'auto')),
  season                 text    NOT NULL DEFAULT 'none'   CHECK (season IN ('spring', 'autumn', 'winter', 'none')),
  season_intensity       text    NOT NULL DEFAULT 'normal' CHECK (season_intensity IN ('low', 'normal', 'high')),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid -- teachers.user_id에 유니크 제약이 없어 FK 없이 감사 기록용으로만 저장
);

-- CREATE TABLE IF NOT EXISTS라 이미 테이블이 있으면 updated_by 컬럼이 없을 수 있어 방어적으로 추가
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS updated_by uuid;

INSERT INTO site_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- 관리자 여부 판정 함수 (is_teacher_or_admin()과 동일한 스타일, role='admin'만 통과)
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM teachers
    WHERE user_id = auth.uid()
      AND role = 'admin'
  );
$function$;

DROP POLICY IF EXISTS site_settings_select_all ON site_settings;
CREATE POLICY site_settings_select_all ON site_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS site_settings_update_admin ON site_settings;
CREATE POLICY site_settings_update_admin ON site_settings FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
