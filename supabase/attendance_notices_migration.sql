-- 학부모 결석/지각 신고 기능
-- 학부모가 특정 자녀의 결석/지각을 신고하면:
--  - 관리자/선생님/조교의 학원일정(/schedule) 캘린더에만 표시 (다른 학부모에게는 비공개)
--  - 신고한 학부모 본인의 학원일정(/parent/events)에는 본인이 등록한 건만 표시
-- 기존 events(학원일정) 테이블은 전교생 대상 공지용이라 학부모 쓰기 권한이 없고 1건이
-- 전체에 노출되는 구조라서, 재사용하지 않고 전용 테이블을 새로 만듭니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS attendance_notices (
  id bigint generated always as identity primary key,
  parent_id integer NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL CHECK (type IN ('absence', 'late')),  -- 'absence'=결석, 'late'=지각
  reason text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_notices_date ON attendance_notices(date);
CREATE INDEX IF NOT EXISTS idx_attendance_notices_parent_id ON attendance_notices(parent_id);
CREATE INDEX IF NOT EXISTS idx_attendance_notices_student_id ON attendance_notices(student_id);

ALTER TABLE attendance_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_notices_staff ON attendance_notices;
DROP POLICY IF EXISTS attendance_notices_select_anon ON attendance_notices;
DROP POLICY IF EXISTS attendance_notices_insert_anon ON attendance_notices;

-- 관리자/선생님/조교 — 전체 조회 (is_teacher_or_admin()이 admin/teacher/assistant를 모두 포함)
CREATE POLICY attendance_notices_staff ON attendance_notices
  FOR ALL TO public USING (is_teacher_or_admin());

-- 학부모(anon) — 조회는 전체 허용(다른 학부모 테이블과 동일하게 클라이언트에서 parent_id로
-- 제한해 본인 신고 내역만 보여줌), 신고 등록만 가능(수정/삭제는 관리자만)
CREATE POLICY attendance_notices_select_anon ON attendance_notices
  FOR SELECT TO anon USING (true);
CREATE POLICY attendance_notices_insert_anon ON attendance_notices
  FOR INSERT TO anon WITH CHECK (true);
