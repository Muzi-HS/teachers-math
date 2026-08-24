-- 수업기록 학부모 의견을 단방향 메모에서 양방향 댓글 스레드로 전환
-- - record_comments: 수업기록(record_id) 1건당 여러 건의 메시지(학부모/관리자·선생님)를 저장
-- - records.parent_comment / parent_comment_at / parent_comment_read_at 컬럼은 삭제하지 않고
--   "가장 최근 학부모 메시지" 미러(요약)로 계속 사용합니다 — 사이드바 안읽음 배지, 대시보드,
--   학원 달력의 안읽은 의견 표시가 전부 이 컬럼을 기준으로 만들어져 있어서, 학부모가 새 메시지를
--   보낼 때마다 트리거로 이 컬럼들을 자동 갱신해 기존 기능을 그대로 재사용합니다.
-- Supabase 대시보드 > SQL Editor에서 실행하세요

CREATE TABLE IF NOT EXISTS record_comments (
  id bigint generated always as identity primary key,
  record_id bigint NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('parent', 'admin')),
  sender_teacher_id uuid,           -- sender_type='admin'일 때 작성한 관리자/선생님(teachers.user_id)
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz,           -- 관리자/선생님이 자신의 메시지를 수정한 경우 설정
  is_read boolean DEFAULT false     -- 학부모 메시지를 관리자/선생님이 읽었는지
);
CREATE INDEX IF NOT EXISTS idx_record_comments_record_id ON record_comments(record_id);
CREATE INDEX IF NOT EXISTS idx_record_comments_created_at ON record_comments(created_at);

ALTER TABLE record_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS record_comments_staff ON record_comments;
DROP POLICY IF EXISTS record_comments_select_anon ON record_comments;
DROP POLICY IF EXISTS record_comments_insert_anon ON record_comments;

-- 관리자/선생님/조교 — 전체 조회/작성/수정(자기 메시지 수정)/삭제
CREATE POLICY record_comments_staff ON record_comments
  FOR ALL TO public USING (is_teacher_or_admin());

-- 학부모(anon) — 조회는 전체 허용(클라이언트에서 record_id로 제한), 작성은 sender_type='parent'인
-- 자기 메시지만 허용. 학부모는 수정/삭제 불가 (문의하기와 동일한 원칙)
CREATE POLICY record_comments_select_anon ON record_comments
  FOR SELECT TO anon USING (true);
CREATE POLICY record_comments_insert_anon ON record_comments
  FOR INSERT TO anon WITH CHECK (sender_type = 'parent');

-- 기존 단일 필드 학부모 의견을 최초 메시지로 이관 (이미 이관된 record_id는 중복 삽입하지 않음)
INSERT INTO record_comments (record_id, sender_type, content, created_at, is_read)
SELECT r.id, 'parent', r.parent_comment, r.parent_comment_at,
       (r.parent_comment_read_at IS NOT NULL AND r.parent_comment_read_at >= r.parent_comment_at)
FROM records r
WHERE r.parent_comment IS NOT NULL AND r.parent_comment_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM record_comments c WHERE c.record_id = r.id);

-- 학부모가 새 메시지를 보내면 records.parent_comment(_at) 미러 컬럼을 자동 갱신
-- (parent_comment_read_at은 건드리지 않으므로, 이미 확인했던 기록도 새 메시지가 오면 다시 "안읽음"이 됨)
CREATE OR REPLACE FUNCTION public.sync_record_comment_mirror()
RETURNS trigger AS $$
BEGIN
  IF NEW.sender_type = 'parent' THEN
    UPDATE records SET parent_comment = NEW.content, parent_comment_at = NEW.created_at
    WHERE id = NEW.record_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_record_comment_mirror ON record_comments;
CREATE TRIGGER trg_sync_record_comment_mirror
  AFTER INSERT ON record_comments
  FOR EACH ROW EXECUTE FUNCTION public.sync_record_comment_mirror();
