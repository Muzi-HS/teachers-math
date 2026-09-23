-- 계절 효과를 홈페이지뿐 아니라 대시보드 등 내부 작업 화면(선생님/학부모/학생 로그인 후 화면)에도
-- 표시할지 선택하는 옵션. site_settings_migration.sql을 먼저 실행한 뒤 이 파일을 실행하세요.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS season_show_in_workspace boolean NOT NULL DEFAULT false;
