-- 학원일정 > 일정 추가의 "휴강 등록" — 특정 날짜에 특정 반(들)의 수업을 휴강 처리한다.
-- 기존 events 테이블은 반 구분이 없는 전교생 공지용이라(attendance_notices_migration.sql
-- 주석 참고) 반별 휴강은 별도 테이블로 관리한다. 학생/학부모 화면은 다른 학사 정보
-- 테이블(classes 등)과 동일하게 로그인 세션 없이 anon 키로 읽으므로 anon SELECT를 열어두고,
-- 등록/삭제는 반관리·학원일정 화면처럼 선생님/관리자만 가능하게 한다.
CREATE TABLE IF NOT EXISTS class_cancellations (
  id bigint generated always as identity primary key,
  class_id bigint not null references classes(id) on delete cascade,
  cancel_date date not null,
  memo text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (class_id, cancel_date)
);

CREATE INDEX IF NOT EXISTS class_cancellations_class_date_idx ON class_cancellations (class_id, cancel_date);

ALTER TABLE class_cancellations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_cancellations_staff ON class_cancellations;
CREATE POLICY class_cancellations_staff ON class_cancellations
  FOR ALL TO authenticated USING (is_teacher_or_admin()) WITH CHECK (is_teacher_or_admin());

DROP POLICY IF EXISTS class_cancellations_select_anon ON class_cancellations;
CREATE POLICY class_cancellations_select_anon ON class_cancellations FOR SELECT TO anon USING (true);
