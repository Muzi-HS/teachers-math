-- 공지사항 기능 확장
-- 1) notice_target_students: 공지사항을 "선택한 학생의 학부모"에게만 공개할 수 있도록
--    대상 학생을 지정하는 매핑 테이블. 특정 notice_id에 대해 이 테이블에 행이 하나도
--    없으면 기존과 동일하게 "전체 학부모 공개"(parent_visible=true 기준)로 동작하고,
--    행이 있으면 그 학생들의 학부모에게만 공개됩니다.
-- 2) notice_comments: 학부모가 공지사항에 댓글(익명 선택 가능)을 남기고, 관리자/선생님이
--    그 댓글에 대댓글을 남길 수 있는 스레드 (parent_comment_id가 null이면 학부모의 최상위
--    댓글, 값이 있으면 그 댓글에 대한 관리자 대댓글)
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS notice_target_students (
  notice_id bigint NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  student_id integer NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (notice_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_notice_target_students_notice_id ON notice_target_students(notice_id);
CREATE INDEX IF NOT EXISTS idx_notice_target_students_student_id ON notice_target_students(student_id);

ALTER TABLE notice_target_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notice_target_students_staff ON notice_target_students;
DROP POLICY IF EXISTS notice_target_students_select_anon ON notice_target_students;

-- 관리자/선생님/조교 — 전체 조회/작성/삭제 (대상 학생 지정·수정)
CREATE POLICY notice_target_students_staff ON notice_target_students
  FOR ALL TO public USING (is_teacher_or_admin());

-- 학부모(anon) — 어떤 공지가 자신의 자녀를 대상으로 하는지 확인해야 하므로 조회만 허용
CREATE POLICY notice_target_students_select_anon ON notice_target_students
  FOR SELECT TO anon USING (true);


CREATE TABLE IF NOT EXISTS notice_comments (
  id bigint generated always as identity primary key,
  notice_id bigint NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
  parent_comment_id bigint REFERENCES notice_comments(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('parent', 'admin')),
  parent_id integer REFERENCES parents(id) ON DELETE SET NULL,   -- sender_type='parent'일 때 작성자
  sender_teacher_id uuid,                                        -- sender_type='admin'일 때 작성자
  is_anonymous boolean NOT NULL DEFAULT false,                   -- 다른 학부모에게 이름 대신 "익명"으로 표시
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_notice_comments_notice_id ON notice_comments(notice_id);
CREATE INDEX IF NOT EXISTS idx_notice_comments_parent_comment_id ON notice_comments(parent_comment_id);

ALTER TABLE notice_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notice_comments_staff ON notice_comments;
DROP POLICY IF EXISTS notice_comments_select_anon ON notice_comments;
DROP POLICY IF EXISTS notice_comments_insert_anon ON notice_comments;

-- 관리자/선생님/조교 — 전체 조회/작성(대댓글)/수정/삭제(댓글 관리)
CREATE POLICY notice_comments_staff ON notice_comments
  FOR ALL TO public USING (is_teacher_or_admin());

-- 학부모(anon) — 조회는 전체 허용(같은 공지를 보는 다른 학부모의 댓글도 봐야 함),
-- 작성은 sender_type='parent'인 최상위 댓글만 허용(parent_comment_id는 반드시 null —
-- 학부모는 다른 댓글에 대댓글을 달 수 없음). 학부모는 수정/삭제 불가.
CREATE POLICY notice_comments_select_anon ON notice_comments
  FOR SELECT TO anon USING (true);
CREATE POLICY notice_comments_insert_anon ON notice_comments
  FOR INSERT TO anon WITH CHECK (sender_type = 'parent' AND parent_comment_id IS NULL);
