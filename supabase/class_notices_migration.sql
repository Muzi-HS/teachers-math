-- 반관리 > 반 상세에서 "공지하기"로 보내는 반별 공지사항.
-- 관리자/선생님만 쓸 수 있고(반관리 화면은 실제 Supabase Auth로 로그인하므로 staff 정책),
-- 학생 계정은 로그인 세션 없이 anon 키로 읽으므로 다른 테이블들과 동일하게 anon SELECT를 열어둔다.
CREATE TABLE IF NOT EXISTS class_notices (
  id bigint generated always as identity primary key,
  class_id bigint not null references classes(id) on delete cascade,
  content text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

ALTER TABLE class_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_notices_staff ON class_notices;
CREATE POLICY class_notices_staff ON class_notices
  FOR ALL TO authenticated USING (is_teacher_or_admin()) WITH CHECK (is_teacher_or_admin());

DROP POLICY IF EXISTS class_notices_select_anon ON class_notices;
CREATE POLICY class_notices_select_anon ON class_notices FOR SELECT TO anon USING (true);
