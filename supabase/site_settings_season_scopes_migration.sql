-- 계절 효과 적용 범위를 단일 on/off(season_show_in_workspace)에서 다중 선택(text[])으로 확장.
-- 메인 화면/관리자·선생님 화면/학부모 화면/학생 화면을 각각 독립적으로 켜고 끌 수 있다.
-- site_settings_migration.sql, site_settings_workspace_scope_migration.sql을 먼저 실행한 뒤
-- 이 파일을 실행하세요. Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS season_scopes text[] NOT NULL DEFAULT '{main}';

-- 기존 season_show_in_workspace 값을 새 컬럼으로 1회 이관 (이미 season_scopes를 저장한 적이 있으면 건드리지 않음)
UPDATE site_settings
SET season_scopes = CASE WHEN season_show_in_workspace THEN ARRAY['main', 'admin', 'parent', 'student'] ELSE ARRAY['main'] END
WHERE id = 1 AND season_scopes = '{main}';
