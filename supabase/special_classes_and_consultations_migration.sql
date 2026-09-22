-- /home-preview 시안 기능 지원
-- 1) special_classes: 관리자 계정에서 CRUD하는 "특강" 홍보 게시물. 공개 시안 페이지에서는
--    is_active=true인 것만 누구나(anon) 조회할 수 있다.
-- 2) consultation_requests: 시안 페이지의 상담 신청 폼에서 접수되는 문의. 누구나(anon)
--    작성(INSERT)만 가능하고, 조회/상태변경/삭제는 관리자·선생님·조교만 가능하다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS special_classes (
  id bigint generated always as identity primary key,
  title text NOT NULL,
  subtitle text,
  description text,
  period text,
  target text,
  capacity text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE special_classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS special_classes_staff ON special_classes;
DROP POLICY IF EXISTS special_classes_select_anon ON special_classes;

-- 관리자/선생님/조교 — 전체 조회/작성/수정/삭제
CREATE POLICY special_classes_staff ON special_classes
  FOR ALL TO public USING (is_teacher_or_admin());

-- 비로그인 방문자(anon) — 노출 중인 특강만 조회
CREATE POLICY special_classes_select_anon ON special_classes
  FOR SELECT TO anon USING (is_active = true);


CREATE TABLE IF NOT EXISTS consultation_requests (
  id bigint generated always as identity primary key,
  student_name text NOT NULL,
  grade text NOT NULL,
  school text,
  guardian_phone text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'done')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consultation_requests_created_at ON consultation_requests(created_at DESC);

ALTER TABLE consultation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_requests_staff ON consultation_requests;
DROP POLICY IF EXISTS consultation_requests_insert_anon ON consultation_requests;

-- 관리자/선생님/조교 — 전체 조회/상태변경/삭제
CREATE POLICY consultation_requests_staff ON consultation_requests
  FOR ALL TO public USING (is_teacher_or_admin());

-- 비로그인 방문자(anon) — 신청 폼 작성(INSERT)만 가능, 조회는 불가
CREATE POLICY consultation_requests_insert_anon ON consultation_requests
  FOR INSERT TO anon WITH CHECK (true);
