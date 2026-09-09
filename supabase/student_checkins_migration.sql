-- 태블릿 키오스크(/checkin)에서 학부모 전화번호 뒷 4자리로 학생 등원을 체크인한 기록.
-- kiosk-checkin 엣지 함수(서비스 롤 키)만 저장하므로 anon/authenticated 쓰기 정책은
-- 두지 않고, 반관리·수업기록 화면에서 지각/정시를 자동 반영하기 위해 스태프 조회만 허용한다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS student_checkins (
  id bigint generated always as identity primary key,
  student_id bigint not null references students(id) on delete cascade,
  class_id bigint references classes(id) on delete set null,
  date date not null,
  checked_in_at timestamptz not null default now(),
  late boolean not null default false,
  created_at timestamptz not null default now()
);

CREATE INDEX IF NOT EXISTS idx_student_checkins_student_date ON student_checkins(student_id, date);

ALTER TABLE student_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_checkins_staff_read ON student_checkins;
CREATE POLICY student_checkins_staff_read ON student_checkins
  FOR SELECT TO authenticated USING (is_teacher_or_admin());
