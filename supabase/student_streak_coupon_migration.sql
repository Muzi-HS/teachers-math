-- 학생 계정의 "숙제 이행률 연속 달성" 쿠폰 시스템.
-- student_streak_state: 학생별로 마지막으로 쿠폰을 받은 날짜(last_claimed_date) 이후의
--   스트릭만 계산 대상으로 삼는다 — 쿠폰을 받으면 그 시점부터 처음부터 다시 세기
--   시작한다. last_seen_streak/last_prompted_milestone은 그 계산 범위 안에서 이미
--   물어본(받았거나 넘긴) 가장 높은 마일스톤을 기억해 같은 마일스톤을 반복해서 묻지 않는다.
-- student_coupons: 학생이 "쿠폰 받기"를 선택했을 때 실제로 발급되는 쿠폰함 항목.
--   used/used_at은 반관리 관리자가 실제 사용 처리를 할 때 기록한다.
CREATE TABLE IF NOT EXISTS student_streak_state (
  student_id bigint primary key references students(id) on delete cascade,
  last_seen_streak int not null default 0,
  last_prompted_milestone int not null default 0,
  last_claimed_date date,
  updated_at timestamptz not null default now()
);

CREATE TABLE IF NOT EXISTS student_coupons (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  milestone int not null,
  streak_value int not null,
  claimed_at timestamptz not null default now(),
  used boolean not null default false,
  used_at timestamptz
);

ALTER TABLE student_streak_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_coupons ENABLE ROW LEVEL SECURITY;

-- 학생 계정은 로그인 세션 없이 anon 키로 동작하므로(다른 학생 관련 테이블과 동일한 방식),
-- 자기 student_id로 걸러서 쓰는 걸 신뢰하고 anon 조회/기록을 열어둔다.
DROP POLICY IF EXISTS student_streak_state_anon ON student_streak_state;
CREATE POLICY student_streak_state_anon ON student_streak_state
  FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS student_streak_state_staff ON student_streak_state;
CREATE POLICY student_streak_state_staff ON student_streak_state
  FOR ALL TO authenticated USING (is_teacher_or_admin()) WITH CHECK (is_teacher_or_admin());

-- 쿠폰은 학생이 "받기"를 선택할 때 생성(anon insert/select)하되, "사용 처리"는 관리자만.
DROP POLICY IF EXISTS student_coupons_select_anon ON student_coupons;
CREATE POLICY student_coupons_select_anon ON student_coupons FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS student_coupons_insert_anon ON student_coupons;
CREATE POLICY student_coupons_insert_anon ON student_coupons FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS student_coupons_staff ON student_coupons;
CREATE POLICY student_coupons_staff ON student_coupons
  FOR ALL TO authenticated USING (is_teacher_or_admin()) WITH CHECK (is_teacher_or_admin());
