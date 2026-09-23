-- 홈페이지 접속 로그 — 관리자 분석 페이지(일일/월별 접속량)용.
-- 비로그인 방문자도 기록해야 하므로 anon INSERT를 허용하고, 조회는 admin만 가능하다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS site_visits (
  id          bigserial PRIMARY KEY,
  visited_at  timestamptz NOT NULL DEFAULT now(),
  session_id  text,                 -- 브라우저 세션(탭)별 랜덤 id, 탭을 새로 열면 다시 기록됨
  path        text,                 -- 접속 경로(현재는 '/' 홈페이지만 기록)
  is_mobile   boolean DEFAULT false
);

CREATE INDEX IF NOT EXISTS site_visits_visited_at_idx ON site_visits (visited_at);

ALTER TABLE site_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_visits_insert_all ON site_visits;
CREATE POLICY site_visits_insert_all ON site_visits FOR INSERT WITH CHECK (true);

-- is_admin()은 site_settings_migration.sql에서 이미 생성됨
DROP POLICY IF EXISTS site_visits_select_admin ON site_visits;
CREATE POLICY site_visits_select_admin ON site_visits FOR SELECT USING (is_admin());
